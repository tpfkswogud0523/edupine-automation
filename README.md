# edupine-automation

K에듀파인 기안문 자동 작성 도구 — Node.js + Playwright + Claude AI

공인인증서로 수동 로그인 후, 붙임 파일을 주면 AI가 내용을 분석해 기안문을 자동으로 작성하고 에듀파인에 입력합니다.

---

## 요구사항

- Node.js 18 이상
- K에듀파인 계정 (공인인증서 로그인)
- Anthropic Claude API 키 (AI 내용 생성 시 필요, 선택사항)
- Windows 환경 권장 (HWP 파일 처리 시 한컴오피스 필요)

---

## 설치 방법

1. 저장소 클론
   ```
   git clone https://github.com/tpfkswogud0523/edupine-automation.git
   cd edupine-automation
   ```

2. 패키지 설치
   ```
   npm install
   ```

3. Playwright 브라우저 설치 (최초 1회)
   ```
   npx playwright install chromium
   ```

4. 환경설정 파일 생성
   - `.env.example`을 복사해서 `.env`로 저장
   ```
   copy .env.example .env
   ```
   - `.env` 파일을 메모장으로 열어 아래 항목 입력
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   SCHOOL_NAME=학교이름
   TEACHER_NAME=교사이름
   DEPARTMENT=부서명
   ```
   > 로그인은 공인인증서로 수동으로 하기 때문에 ID/PW는 불필요합니다.

---

## 사용 방법

1. 에듀파인 전용 Chrome 창 실행 방법 (최초 설정)
   - Chrome 바로가기를 만들고 대상에 아래 추가
   ```
   --remote-debugging-port=9222 --user-data-dir="C:\edupine-chrome"
   ```
   - 해당 Chrome으로 K에듀파인 접속 후 공인인증서로 로그인
   - 일반기안문 작성 화면까지 직접 이동

2. 프로그램 실행
   ```
   node main.js
   ```

3. 메뉴 선택
   - `1` — 기안문 자동 작성
   - `2` — 글 양식 목록 보기
   - `3` — 새 글 양식 추가
   - `4` — 화면 구조 분석 (에듀파인 UI 업데이트 시 사용)

4. 기안문 자동 작성 순서
   - 글 양식 번호 선택
   - 붙임 파일 경로 입력 (HWP, PDF, DOCX, XLSX 등)
   - AI가 파일 내용 분석 후 기안문 내용 생성
   - 내용 확인 후 `y` 입력하면 에듀파인에 자동 입력

---

## 지원 파일 형식

| 형식 | 설명 | 비고 |
|------|------|------|
| .hwp | 아래아한글 | 한컴오피스 설치 시 COM 자동화 |
| .hwpx | 한글 신버전 | ZIP+XML 직접 파싱 |
| .pdf | PDF 문서 | pdf-parse |
| .docx | MS Word | mammoth |
| .xlsx / .xls | Excel | SheetJS |
| .txt / .csv | 텍스트 | EUC-KR/UTF-8 자동 감지 |

---

## 파일 구조

```
edupine-automation/
├── main.js              # 메인 실행 (메뉴 UI)
├── automation.js        # 에듀파인 브라우저 자동화
├── fileParser.js        # 붙임 파일 파싱
├── templateManager.js   # 글 양식 관리
├── aiHelper.js          # Claude AI 기안문 내용 생성
├── addTemplates.js      # 양식 추가 유틸
├── templates/
│   └── templates.json   # 저장된 글 양식
├── .env.example         # 환경설정 예시 (복사해서 .env로 사용)
└── .env                 # 실제 설정 파일 (직접 생성, 커밋 금지)
```

---

## 글 양식 형식

아래 형식으로 텍스트를 입력하면 양식으로 저장됩니다.

```
1. 목적
2. 행사 개요
   가. 일  시:
   나. 장  소:
   다. 대  상:
3. 세부 내용
   가.
   나.
붙임. 관련 자료 1부.  끝.
```

기본 제공 양식: 현장체험학습 계획 / 방과후학교 운영계획 / 협조 요청 / 특수교육 지원 신청

---

## 자주 묻는 문제

- **에듀파인 자동 입력 안 됨**: 메뉴 4번 화면 구조 분석 실행 후 `automation.js`의 selector 수정 필요
- **HWP 파일 읽기 실패**: 한컴오피스가 설치되어 있어야 COM 자동화 가능. 없으면 .hwpx 형식으로 저장 후 시도
- **Chrome 연결 안 됨**: 에듀파인 전용 Chrome이 `--remote-debugging-port=9222` 옵션으로 실행 중인지 확인
- **API 키 오류**: `.env`의 `ANTHROPIC_API_KEY` 값 확인

---

## Claude API 키 발급

1. https://console.anthropic.com 접속
2. 회원가입 / 로그인
3. API Keys → Create Key
4. `.env`의 `ANTHROPIC_API_KEY`에 붙여넣기

---

## 기술 스택

- Node.js
- Playwright (Chromium, headless:false — 브라우저 창 직접 조작)
- Anthropic Claude API
