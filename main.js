#!/usr/bin/env node
require('./sentry-init');

/**
 * K에듀파인 기안문 자동화 - 메인 실행 파일
 *
 * 사용법:
 *   node main.js          → 메뉴 실행
 *   node main.js --login  → 자동 로그인 후 바로 기안문 작성
 */

require('dotenv').config();

const readline = require('readline');
const automation = require('./automation');
const loginModule = require('./login');
const { parseFiles } = require('./fileParser');
const templateMgr = require('./templateManager');
const ai = require('./aiHelper');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function sep(char = '═', len = 55) { console.log(char.repeat(len)); }

// 자동 로그인으로 얻은 세션 (있으면 CDP 연결 대신 사용)
let loginSession = null;

// ─────────────────────────────────────────
// 메인 메뉴
// ─────────────────────────────────────────
async function mainMenu() {
  console.clear();
  sep();
  console.log('  📋 K에듀파인 기안문 자동화 시스템');
  sep();
  console.log('  1. 기안문 자동 작성');
  console.log('  2. 글 양식 관리 (목록/추가/삭제)');
  console.log('  3. 파일 내용 미리보기');
  console.log('  4. Chrome 연결 확인 (수동 로그인 방식)');
  console.log('  5. 자동 로그인 (인증서 비밀번호 자동 입력)');
  console.log('  6. 에듀파인 화면 구조 분석 (개발자용)');
  console.log('  0. 종료');
  sep();
  if (loginSession) {
    console.log('  ✅ 자동 로그인 세션 활성화됨');
  } else {
    console.log('  ※ 5번으로 자동 로그인하거나, 수동으로 Chrome 실행 후 1번 실행');
  }
  sep();

  const choice = await ask('  선택: ');

  switch (choice.trim()) {
    case '1': await menuAutoWrite(); break;
    case '2': await menuTemplates(); break;
    case '3': await menuFilePreview(); break;
    case '4': await menuCheckConnection(); break;
    case '5': await menuAutoLogin(); break;
    case '6': await menuAnalyze(); break;
    case '0':
      rl.close();
      await automation.disconnect();
      process.exit(0);
    default:
      console.log('  잘못된 입력입니다.');
      await ask('  엔터를 눌러 계속...');
  }

  await mainMenu();
}

// ─────────────────────────────────────────
// 메뉴 5: 자동 로그인
// ─────────────────────────────────────────
async function menuAutoLogin() {
  console.clear();
  sep();
  console.log('  🔐 APKI 자동 로그인');
  sep();
  console.log('  .env 파일의 CERT_PASSWORD로 인증서 로그인을 자동 처리합니다.');
  console.log('  USB(이동식디스크)가 연결되어 있어야 합니다.\n');

  if (!process.env.CERT_PASSWORD) {
    console.log('  ❌ .env 파일에 CERT_PASSWORD가 없습니다.');
    console.log('  .env.example을 참고해서 추가해주세요.');
    await ask('\n  엔터...');
    return;
  }

  const go = await ask('  자동 로그인 시작? (y/N): ');
  if (go.toLowerCase() !== 'y') return;

  try {
    console.log('');
    const session = await loginModule.launchAndLogin();
    loginSession = session;

    // automation 모듈에 세션 주입
    automation.setBrowserPage(session.browser, session.page);

    console.log('\n  ✅ 로그인 완료. 이제 메뉴 1번으로 기안문 작성을 시작하세요.');
  } catch (e) {
    console.log(`\n  ❌ 자동 로그인 실패: ${e.message}`);
    console.log('  수동으로 Chrome을 실행해서 로그인 후 1번을 사용하세요.');
  }

  await ask('\n  엔터를 눌러 메인 메뉴로...');
}

// ─────────────────────────────────────────
// 메뉴 1: 기안문 자동 작성
// ─────────────────────────────────────────
async function menuAutoWrite() {
  console.clear();
  sep();
  console.log('  📝 기안문 자동 작성');
  sep();

  const templates = templateMgr.listTemplates();
  if (templates.length === 0) {
    console.log('  ⚠️  저장된 양식이 없습니다. 먼저 양식을 등록해주세요.');
    await ask('  엔터...');
    return;
  }

  console.log('\n  저장된 양식 목록:');
  templates.forEach((t, i) => {
    const cat = t.category ? `[${t.category}]` : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${cat} ${t.name}`);
  });

  const tIdx = await ask('\n  사용할 양식 번호: ');
  const template = templates[parseInt(tIdx) - 1];
  if (!template) {
    console.log('  잘못된 번호입니다.');
    await ask('  엔터...');
    return;
  }

  console.log(`\n  ✅ 선택: [${template.category}] ${template.name}`);
  console.log('\n  ── 양식 미리보기 ──');
  console.log(template.formatText);
  console.log('─'.repeat(40));

  let title = await ask('\n  문서 제목: ');
  if (!title.trim()) {
    console.log('  제목을 입력해야 합니다.');
    await ask('  엔터...');
    return;
  }

  let bodyText = '';
  const useAi = await ask('\n  AI로 본문 자동 생성? (y/N): ');

  if (useAi.toLowerCase() === 'y') {
    console.log('\n  📎 붙임 파일 경로 입력 (없으면 엔터):');
    console.log('  예) C:\\Users\\Administrator\\Desktop\\계획서.hwp');
    const filesInput = await ask('  파일: ');

    let attachedFileData = [];
    if (filesInput.trim()) {
      const filePaths = filesInput.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''));
      console.log('\n  파일 파싱 중...');
      attachedFileData = await parseFiles(filePaths);
      for (const f of attachedFileData) {
        if (f.success) console.log(`  ✅ ${f.fileName} (${f.text.length}자)`);
        else console.log(`  ❌ ${f.fileName}: ${f.error}`);
      }
    }

    const hints = await ask('\n  추가 지시사항 (예: "3학년 학생 5명 대상, 6월 예정"): ');
    const schoolInfo = {
      schoolName: process.env.SCHOOL_NAME || '효문고등학교',
      teacherName: process.env.TEACHER_NAME || '',
      department: process.env.DEPARTMENT || '특수교육'
    };

    try {
      console.log('\n  AI 생성 중...');
      const generated = await ai.generateDocumentContent({
        template, attachedFiles: attachedFileData, schoolInfo, additionalHints: hints
      });
      title = title || generated.title;
      bodyText = generated.body;
    } catch (aiErr) {
      console.log(`\n  ❌ AI 오류: ${aiErr.message}`);
      bodyText = await inputBodyManually(template.formatText);
    }
  } else {
    bodyText = await inputBodyManually(template.formatText);
  }

  console.log('\n' + '─'.repeat(55));
  console.log('  🎯 기안문 미리보기');
  console.log('─'.repeat(55));
  console.log(`  제목: ${title}`);
  console.log('');
  console.log(bodyText);
  console.log('─'.repeat(55));

  const confirm = await ask('\n  이 내용으로 에듀파인에 입력하시겠습니까? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    await ask('  취소됨. 엔터...');
    return;
  }

  await runEdupineAutoFill({ title, bodyText, template });
  await ask('\n  엔터를 눌러 메인 메뉴로...');
}

async function inputBodyManually(formatText) {
  console.log('\n  양식의 ___ 부분을 채워주세요.\n');
  console.log('  1. 빈칸(___)만 채우기');
  console.log('  2. 본문 전체 입력');
  const method = await ask('  선택 (1/2): ');

  if (method.trim() === '1') {
    const blanks = formatText.match(/___/g);
    if (!blanks) return formatText;
    console.log(`\n  빈칸 ${blanks.length}개를 순서대로 입력하세요:`);
    let tempBody = formatText;
    for (let i = 0; i < blanks.length; i++) {
      const ctx = tempBody.substring(
        Math.max(0, tempBody.indexOf('___') - 30),
        tempBody.indexOf('___') + 30
      );
      const val = await ask(`  [${i + 1}/${blanks.length}] "...${ctx}..." → `);
      tempBody = tempBody.replace('___', val);
    }
    return tempBody;
  } else {
    console.log('\n  본문을 입력하세요. 완료 후 빈 줄에서 "END" 입력:');
    const lines = [];
    while (true) {
      const line = await ask('');
      if (line.toUpperCase() === 'END') break;
      lines.push(line);
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────
// 에듀파인 자동 입력 실행
// ─────────────────────────────────────────
async function runEdupineAutoFill({ title, bodyText, template }) {
  try {
    // 자동 로그인 세션이 있으면 재사용, 없으면 CDP 연결
    if (loginSession) {
      console.log('\n  ✅ 자동 로그인 세션 사용');
    } else {
      console.log('\n  🌐 Chrome CDP 연결 중...');
      await automation.connectToChrome();
      await automation.findEdupinePage();
    }

    const navigated = await automation.navigateToDraftWrite();
    if (!navigated) {
      console.log('\n  ⚠️  Chrome에서 직접 기안문 작성 화면을 열어주세요.');
      await ask('  준비 완료 후 엔터...');
    }

    const result = await automation.fillDocument({
      title,
      bodyText,
      type: template.category === '재정기안문' ? '재정기안문' : '일반기안문'
    });

    console.log('\n  ── 입력 결과 ──────────────────────────');
    console.log(`  제목: ${result.titleFilled ? '✅' : '❌ 수동 입력 필요'}`);
    console.log(`  본문: ${result.bodyFilled ? '✅' : '❌ 수동 입력 필요'}`);
    console.log('  결재경로: ✋ 수동 설정 필요');
    console.log('  ─────────────────────────────────────');

  } catch (e) {
    console.log(`\n  ❌ 오류: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// 메뉴 2: 양식 관리
// ─────────────────────────────────────────
async function menuTemplates() {
  console.clear();
  sep();
  console.log('  📂 글 양식 관리');
  sep();
  console.log('  1. 양식 목록 보기');
  console.log('  2. 양식 상세 보기');
  console.log('  3. 새 양식 등록');
  console.log('  4. 양식 삭제');
  console.log('  0. 뒤로');
  sep();

  const choice = await ask('  선택: ');
  switch (choice.trim()) {
    case '1': {
      const list = templateMgr.listTemplates();
      console.log(`\n  저장된 양식 (${list.length}개):`);
      if (list.length === 0) console.log('  (없음)');
      else list.forEach((t, i) => {
        console.log(`\n  ${i + 1}. [${t.category || '기타'}] ${t.name}`);
        if (t.description) console.log(`     ${t.description}`);
      });
      break;
    }
    case '2': {
      const list = templateMgr.listTemplates();
      list.forEach((t, i) => console.log(`  ${i + 1}. [${t.category}] ${t.name}`));
      const idx = await ask('  번호: ');
      const tmpl = list[parseInt(idx) - 1];
      if (tmpl) { console.log(`\n  ── [${tmpl.name}] ──`); console.log(tmpl.formatText); }
      break;
    }
    case '3': await templateMgr.interactiveTemplateInput(); break;
    case '4': {
      const list = templateMgr.listTemplates();
      list.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
      const idx = await ask('  삭제할 번호: ');
      const tmpl = list[parseInt(idx) - 1];
      if (tmpl) {
        const ok = await ask(`  "${tmpl.name}" 삭제? (y/N): `);
        if (ok.toLowerCase() === 'y') { templateMgr.deleteTemplate(tmpl.id); console.log('  ✅ 삭제됨'); }
      }
      break;
    }
  }
  await ask('\n  엔터를 눌러 계속...');
}

// ─────────────────────────────────────────
// 메뉴 3: 파일 미리보기
// ─────────────────────────────────────────
async function menuFilePreview() {
  console.clear();
  sep();
  console.log('  🔍 파일 내용 미리보기');
  sep();

  const fileInput = await ask('  파일 경로 (끌어다 놓기 가능): ');
  const fp = fileInput.trim().replace(/^["']|["']$/g, '');

  try {
    const { parseFile } = require('./fileParser');
    const result = await parseFile(fp);
    console.log(`\n  파일: ${result.fileName}`);
    console.log(`  형식: ${result.extension}`);
    console.log(`  길이: ${result.text.length}자`);
    console.log('\n  내용 (최대 500자):');
    console.log('─'.repeat(40));
    console.log(result.text.substring(0, 500));
    console.log('─'.repeat(40));
  } catch (e) {
    console.log(`  ❌ 오류: ${e.message}`);
  }
  await ask('\n  엔터...');
}

// ─────────────────────────────────────────
// 메뉴 4: Chrome 연결 확인
// ─────────────────────────────────────────
async function menuCheckConnection() {
  console.clear();
  sep();
  console.log('  🔗 Chrome CDP 연결 확인 (수동 로그인 방식)');
  sep();

  try {
    await automation.connectToChrome();
    const p = await automation.findEdupinePage();
    console.log(`\n  ✅ 연결 성공!`);
    console.log(`  현재 URL: ${p.url()}`);
  } catch (e) {
    console.log(`\n  ❌ 연결 실패: ${e.message}`);
    console.log('\n  → 바탕화면 "에듀파인 자동화 Chrome" 바로가기로 Chrome 실행 후 재시도');
    console.log('  → 또는 메뉴 5번 자동 로그인 사용');
  }
  await ask('\n  엔터...');
}

// ─────────────────────────────────────────
// 메뉴 6: 화면 구조 분석
// ─────────────────────────────────────────
async function menuAnalyze() {
  console.clear();
  sep();
  console.log('  🔍 에듀파인 화면 구조 분석');
  sep();

  const go = await ask('  시작? (y/N): ');
  if (go.toLowerCase() !== 'y') return;

  try {
    if (!loginSession) await automation.connectToChrome();
    await automation.findEdupinePage();
    await automation.navigateToDraftWrite();
    await automation.analyzePageStructure();

    const shot = await ask('\n  스크린샷 저장? (y/N): ');
    if (shot.toLowerCase() === 'y') await automation.saveScreenshot(`분석_${Date.now()}.png`);
  } catch (e) {
    console.log(`  ❌ 오류: ${e.message}`);
  }
  await ask('\n  엔터...');
}

// ─────────────────────────────────────────
// 실행 시작
// ─────────────────────────────────────────
async function main() {
  templateMgr.initTemplateStorage();

  const args = process.argv.slice(2);

  // node main.js --login → 자동 로그인 후 바로 기안문 작성
  if (args.includes('--login')) {
    try {
      console.log('  🔐 자동 로그인 시작...');
      const session = await loginModule.launchAndLogin();
      loginSession = session;
      automation.setBrowserPage(session.browser, session.page);
      console.log('  ✅ 로그인 완료. 메뉴로 진입합니다.\n');
    } catch (e) {
      console.log(`  ❌ 자동 로그인 실패: ${e.message}`);
      console.log('  수동 로그인 방식으로 계속 진행합니다.\n');
    }
  }

  await mainMenu();
}

main().catch(e => {
  console.error('\n  💥 오류:', e.message);
  process.exit(1);
});
