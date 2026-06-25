/**
 * K에듀파인 APKI 자동 로그인 모듈
 *
 * 동작 순서:
 *   1. Playwright로 Chrome 직접 실행
 *   2. 에듀파인 로그인 페이지 접속
 *   3. 인증서 로그인 버튼 클릭
 *   4. KSIGN 팝업 처리 (브라우저 팝업 방식 → 실패 시 네이티브 창 방식)
 *   5. 로그인 완료 후 browser/page 반환
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');

const LOGIN_URL = 'https://sen.eduptl.kr/bpm_lgn_lg00_001.do';

let browser = null;
let page = null;

async function launchAndLogin() {
  const certPassword = process.env.CERT_PASSWORD || '';
  const certLocation = process.env.CERT_LOCATION || '이동식디스크';

  if (!certPassword) {
    throw new Error('.env 파일에 CERT_PASSWORD가 없습니다. .env.example 참고해서 추가해주세요.');
  }

  console.log('  🌐 Chrome 실행 중...');

  // 설치된 Chrome 우선 사용, 없으면 Playwright 내장 Chromium
  browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized'],
  }).catch(() => chromium.launch({ headless: false, args: ['--start-maximized'] }));

  const context = await browser.newContext({ viewport: null });
  page = await context.newPage();

  console.log('  📡 에듀파인 로그인 페이지 접속 중...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 인증서 로그인 버튼 클릭
  console.log('  🔐 인증서 로그인 버튼 클릭...');
  const loginBtn = page.locator([
    'text=교육행정 전자서명 인증서 로그인',
    'a:has-text("인증서 로그인")',
    'button:has-text("인증서")',
    '.btn-cert',
    '#btnCertLogin',
  ].join(', ')).first();

  await loginBtn.click();
  await page.waitForTimeout(1500);

  // KSIGN 처리: 브라우저 팝업 방식 먼저 시도
  let loginSuccess = false;

  console.log('  🔑 KSIGN 팝업 대기 중...');
  try {
    const popup = await context.waitForEvent('page', { timeout: 5000 });
    loginSuccess = await handleKsignBrowserPopup(popup, certPassword, certLocation);
  } catch {
    console.log('  → 브라우저 팝업 방식 실패, 네이티브 창 방식 시도...');
  }

  // 네이티브 창 방식 (pywin32)
  if (!loginSuccess) {
    loginSuccess = await handleKsignNativeWindow(certPassword, certLocation);
  }

  if (!loginSuccess) {
    throw new Error(
      'KSIGN 자동 처리 실패.\n' +
      '  → 직접 화면에서 인증서 선택 후 비밀번호를 입력해주세요.\n' +
      '  → 로그인 완료 후 엔터를 누르면 계속 진행됩니다.'
    );
  }

  // 로그인 완료 대기
  console.log('  ⏳ 로그인 완료 대기 중...');
  await page.waitForURL(
    url => !url.toString().includes('lgn_lg00'),
    { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`  ✅ 로그인 완료`);
  return { browser, page };
}

// ─────────────────────────────────────────
// 방법 1: 브라우저 팝업 방식 (Playwright)
// ─────────────────────────────────────────
async function handleKsignBrowserPopup(popup, password, certLocation) {
  try {
    await popup.waitForLoadState('domcontentloaded', { timeout: 5000 });
    await popup.waitForTimeout(800);

    console.log(`  팝업 URL: ${popup.url()}`);

    // 인증서 위치 탭 클릭
    await popup.click(`text=${certLocation}`).catch(() => {});
    await popup.waitForTimeout(600);

    // 첫 번째 인증서 선택 (이미 선택돼 있을 수 있음)
    await popup.click('table tbody tr:first-child').catch(async () => {
      await popup.click('tr:has-text("일반인증서")').catch(() => {});
    });
    await popup.waitForTimeout(400);

    // 비밀번호 입력
    const pwdSelectors = [
      'input[type="password"]',
      'input[id*="pwd" i]',
      'input[id*="pass" i]',
      'input[name*="pwd" i]',
      'input[placeholder*="암호"]',
      'input[placeholder*="비밀번호"]',
    ];

    let filled = false;
    for (const sel of pwdSelectors) {
      try {
        await popup.fill(sel, password, { timeout: 1000 });
        filled = true;
        console.log('  ✅ 인증서 암호 입력 완료');
        break;
      } catch { /* 다음 셀렉터 */ }
    }

    if (!filled) return false;

    // 확인 버튼 클릭
    await popup.click('button:has-text("확인")').catch(async () => {
      await popup.click('input[value="확인"]').catch(async () => {
        await popup.keyboard.press('Enter');
      });
    });

    await popup.waitForTimeout(2000);
    console.log('  ✅ KSIGN 처리 완료 (브라우저 팝업 방식)');
    return true;

  } catch (e) {
    console.log(`  ⚠️  브라우저 팝업 처리 실패: ${e.message.substring(0, 80)}`);
    return false;
  }
}

// ─────────────────────────────────────────
// 방법 2: 네이티브 창 방식 (pywin32)
// ─────────────────────────────────────────
async function handleKsignNativeWindow(password, certLocation) {
  try {
    console.log('  🪟 KSIGN 네이티브 창 방식 시도...');
    const scriptPath = path.join(__dirname, 'ksign_helper.py');

    execFileSync('python', [scriptPath, password, certLocation], {
      timeout: 30000,
      encoding: 'utf-8',
    });

    console.log('  ✅ KSIGN 처리 완료 (네이티브 창 방식)');
    return true;

  } catch (e) {
    console.log(`  ⚠️  네이티브 창 방식 실패: ${e.message.substring(0, 100)}`);
    return false;
  }
}

function getPage() { return page; }
function getBrowser() { return browser; }

module.exports = {
  launchAndLogin,
  getPage,
  getBrowser,
};
