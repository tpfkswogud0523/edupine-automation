"""
KSIGN 네이티브 창 자동화 헬퍼 (pywin32)
Usage: python ksign_helper.py <password> [cert_location]
"""

import sys
import time
import win32gui
import win32con
import win32api

# KSIGN이 사용하는 창 제목 후보
KSIGN_TITLES = [
    'KSIGN', '전자서명', '인증서 선택', '교육기관 전자서명인증센터',
    'CrossCert', 'SignKorea', 'NFilter', 'GPKI'
]


def find_ksign_window(timeout=15):
    """KSIGN 창 찾기 (최대 timeout초 대기)"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = []
        def cb(hwnd, _):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if any(t in title for t in KSIGN_TITLES):
                    result.append((hwnd, title))
        win32gui.EnumWindows(cb, None)
        if result:
            hwnd, title = result[0]
            print(f'창 발견: "{title}" (hwnd={hwnd})')
            return hwnd
        time.sleep(0.5)
    return None


def list_children(hwnd):
    """자식 컨트롤 전체 목록"""
    children = []
    def cb(h, _):
        cls = win32gui.GetClassName(h)
        txt = win32gui.GetWindowText(h)
        children.append((h, cls, txt))
    try:
        win32gui.EnumChildWindows(hwnd, cb, None)
    except Exception:
        pass
    return children


def find_password_field(children):
    """ES_PASSWORD 스타일 Edit 컨트롤 찾기"""
    edits = [(h, cls, txt) for h, cls, txt in children if 'Edit' in cls]
    # ES_PASSWORD 스타일 (0x0020)
    for h, cls, txt in edits:
        try:
            style = win32api.GetWindowLong(h, win32con.GWL_STYLE)
            if style & 0x0020:
                return h
        except Exception:
            pass
    # 못 찾으면 마지막 Edit 반환
    return edits[-1][0] if edits else None


def click_button_by_text(children, text):
    """텍스트가 포함된 버튼 클릭"""
    for h, cls, txt in children:
        if 'Button' in cls and text in txt:
            win32api.SendMessage(h, win32con.BM_CLICK, 0, 0)
            time.sleep(0.4)
            print(f'버튼 클릭: "{txt}"')
            return True
    return False


def main():
    password = sys.argv[1] if len(sys.argv) > 1 else ''
    cert_location = sys.argv[2] if len(sys.argv) > 2 else '이동식디스크'

    if not password:
        print('ERROR: 비밀번호 인수가 필요합니다')
        sys.exit(1)

    # KSIGN 창 찾기
    hwnd = find_ksign_window(timeout=15)
    if not hwnd:
        print('ERROR: KSIGN 창을 찾지 못했습니다 (15초 초과)')
        sys.exit(1)

    # 창 활성화
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        pass
    time.sleep(0.5)

    children = list_children(hwnd)
    print(f'자식 컨트롤 수: {len(children)}')
    for h, cls, txt in children:
        if txt:
            print(f'  [{cls}] "{txt}" (hwnd={h})')

    # 인증서 위치 탭 클릭 (이동식디스크 등)
    if not click_button_by_text(children, cert_location):
        print(f'  → "{cert_location}" 탭을 찾지 못했습니다 (이미 선택됐거나 다른 UI)')
    time.sleep(0.8)

    # 자식 목록 갱신 (탭 전환 후)
    children = list_children(hwnd)

    # 비밀번호 입력
    pwd_hwnd = find_password_field(children)
    if not pwd_hwnd:
        print('ERROR: 비밀번호 입력 필드를 찾지 못했습니다')
        sys.exit(1)

    win32gui.SetFocus(pwd_hwnd)
    time.sleep(0.2)
    win32api.SendMessage(pwd_hwnd, win32con.WM_SETTEXT, 0, password)
    print('비밀번호 입력 완료')
    time.sleep(0.3)

    # 확인 버튼 클릭
    if not click_button_by_text(children, '확인'):
        # 확인 버튼 못 찾으면 엔터키
        win32api.SendMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
        print('엔터키 전송 (확인 대체)')

    time.sleep(1)
    print('KSIGN 처리 완료')


if __name__ == '__main__':
    main()
