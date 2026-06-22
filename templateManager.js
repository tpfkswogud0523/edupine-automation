/**
 * 기안문 양식(글 양식) 학습 및 관리 모듈
 *
 * 글 양식 예시:
 *   1. 제목
 *   2. 추진 배경
 *   3. 추진 내용
 *      가. 일시:
 *      나. 장소:
 *      다. 대상:
 *      라. 내용:
 *          1) 세부사항
 *          2) 세부사항
 *   4. 예산
 *   붙임. 관련 자료 1부.  끝.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const TEMPLATES_DIR = path.join(__dirname, 'templates');
const TEMPLATES_FILE = path.join(TEMPLATES_DIR, 'templates.json');

// 번호 체계 패턴들
const NUMBER_PATTERNS = [
  { level: 1, regex: /^(\d+)\.\s*(.*)$/,            type: 'arabic_dot' },     // 1. 2. 3.
  { level: 2, regex: /^([가-힣])\.\s*(.*)$/,        type: 'korean_dot' },     // 가. 나. 다.
  { level: 2, regex: /^([a-zA-Z])\.\s*(.*)$/,       type: 'alpha_dot' },      // a. b. c.
  { level: 3, regex: /^(\d+)\)\s*(.*)$/,             type: 'arabic_paren' },   // 1) 2) 3)
  { level: 3, regex: /^\((\d+)\)\s*(.*)$/,           type: 'arabic_full_paren'}, // (1) (2)
  { level: 4, regex: /^([가-힣])\)\s*(.*)$/,        type: 'korean_paren' },   // 가) 나)
  { level: 5, regex: /^[-•·]\s*(.*)$/,               type: 'bullet' },         // - • ·
  { level: 0, regex: /^붙임[.:]\s*(.*)$/,            type: 'attachment' },     // 붙임.
];

// ─────────────────────────────────────────
// 템플릿 저장소 초기화
// ─────────────────────────────────────────
function initTemplateStorage() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMPLATES_FILE)) {
    const defaultTemplates = {
      templates: [],
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(defaultTemplates, null, 2), 'utf8');
  }
}

// ─────────────────────────────────────────
// 글 양식 파싱 (텍스트 → 구조화된 객체)
// ─────────────────────────────────────────
function parseDocumentFormat(formatText) {
  const lines = formatText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const structure = [];

  for (const line of lines) {
    let matched = false;
    for (const pattern of NUMBER_PATTERNS) {
      const m = line.match(pattern.regex);
      if (m) {
        structure.push({
          level: pattern.level,
          type: pattern.type,
          marker: m[1] || '-',
          content: m[m.length - 1] || '',
          originalLine: line,
          isPlaceholder: line.includes('___') || line.endsWith(':') || line.endsWith('：')
        });
        matched = true;
        break;
      }
    }
    if (!matched && line.length > 0) {
      structure.push({
        level: -1,
        type: 'text',
        marker: '',
        content: line,
        originalLine: line,
        isPlaceholder: line.includes('___')
      });
    }
  }

  return structure;
}

// ─────────────────────────────────────────
// 템플릿 저장
// ─────────────────────────────────────────
function saveTemplate(name, category, formatText, description = '') {
  initTemplateStorage();

  const data = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));

  // 같은 이름 있으면 업데이트
  const existingIdx = data.templates.findIndex(t => t.name === name);
  const template = {
    id: existingIdx >= 0 ? data.templates[existingIdx].id : Date.now().toString(),
    name,
    category,
    description,
    formatText,
    structure: parseDocumentFormat(formatText),
    createdAt: existingIdx >= 0 ? data.templates[existingIdx].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: existingIdx >= 0 ? (data.templates[existingIdx].usageCount || 0) : 0
  };

  if (existingIdx >= 0) {
    data.templates[existingIdx] = template;
  } else {
    data.templates.push(template);
  }

  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');

  console.log(`  ✅ 양식 저장됨: "${name}" (${category})`);
  return template;
}

// ─────────────────────────────────────────
// 템플릿 목록 조회
// ─────────────────────────────────────────
function listTemplates() {
  initTemplateStorage();
  const data = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  return data.templates;
}

// ─────────────────────────────────────────
// 특정 템플릿 조회
// ─────────────────────────────────────────
function getTemplate(nameOrId) {
  const templates = listTemplates();
  return templates.find(t => t.name === nameOrId || t.id === nameOrId);
}

// ─────────────────────────────────────────
// 카테고리별 조회
// ─────────────────────────────────────────
function getTemplatesByCategory(category) {
  const templates = listTemplates();
  return templates.filter(t => t.category === category);
}

// ─────────────────────────────────────────
// 템플릿 삭제
// ─────────────────────────────────────────
function deleteTemplate(nameOrId) {
  initTemplateStorage();
  const data = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  const before = data.templates.length;
  data.templates = data.templates.filter(t => t.name !== nameOrId && t.id !== nameOrId);
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf8');
  return data.templates.length < before;
}

// ─────────────────────────────────────────
// 기본 양식들 등록
// ─────────────────────────────────────────
function registerDefaultTemplates() {
  // 현장체험학습 계획
  saveTemplate(
    '현장체험학습 계획',
    '학교행사',
    `1. 목적
2. 행사 개요
   가. 일  시:
   나. 장  소:
   다. 대  상:
   라. 인  원:
   마. 인솔교사:
3. 세부 프로그램
   가.
   나.
4. 소요 예산
   가. 합계: 원
   나. 내역
       1) 교통비: 원
       2) 입장료: 원
       3) 기타:   원
5. 협조 사항
붙임. 세부 일정표 1부.  끝.`,
    '현장체험학습 계획 기안문 양식'
  );

  // 방과후학교 운영계획
  saveTemplate(
    '방과후학교 운영계획',
    '방과후',
    `1. 목적
2. 운영 개요
   가. 운영 기간:
   나. 운영 시간:
   다. 장    소:
   라. 대    상:
   마. 강    사:
3. 운영 내용
   가. 교육 목표
   나. 교육 내용
       1)
       2)
       3)
4. 평가 계획
5. 기대 효과
붙임. 1. 강의계획서 1부.
      2. 강사 이력서 1부.  끝.`,
    '방과후학교 운영계획 기안문 양식'
  );

  // 공문 시행
  saveTemplate(
    '협조 요청',
    '일반공문',
    `1. 관련 근거
   가.
   나.
2. 요청 내용
3. 협조 사항
   가.
   나.
4. 제출 기한:
붙임. 관련 서식 1부.  끝.`,
    '협조 요청 공문 양식'
  );

  // 특수교육 관련 기안
  saveTemplate(
    '특수교육 지원 신청',
    '특수교육',
    `1. 목적
2. 지원 개요
   가. 대  상:
   나. 지원 내용:
   다. 지원 기간:
3. 추진 일정
   가. 신청:
   나. 선정:
   다. 지원:
4. 행정 사항
   가.
   나.
붙임. 1. 신청서 1부.
      2. 관련 서류 1부.  끝.`,
    '특수교육 지원 관련 기안문 양식'
  );

  console.log('  ✅ 기본 양식 4개 등록 완료');
}

// ─────────────────────────────────────────
// 대화형 양식 입력
// ─────────────────────────────────────────
async function interactiveTemplateInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n═══════════════════════════════════════');
  console.log('  📝 새 글 양식 등록');
  console.log('═══════════════════════════════════════');
  console.log('  예시:');
  console.log('    1. 목적');
  console.log('    2. 행사 개요');
  console.log('       가. 일시:');
  console.log('       나. 장소:');
  console.log('    붙임. 관련 자료 1부.  끝.');
  console.log('');

  const name = await ask('양식 이름 (예: 현장체험학습 계획): ');
  const category = await ask('카테고리 (예: 학교행사/방과후/특수교육/일반공문): ');
  const description = await ask('설명 (선택, 엔터 스킵): ');

  console.log('\n글 양식을 입력하세요. 입력 완료 후 빈 줄에서 "END" 입력:');
  const formatLines = [];
  while (true) {
    const line = await ask('');
    if (line.toUpperCase() === 'END') break;
    formatLines.push(line);
  }

  rl.close();

  const formatText = formatLines.join('\n');
  if (!name || !formatText) {
    console.log('  ❌ 이름 또는 양식이 비어있습니다.');
    return null;
  }

  return saveTemplate(name, category || '기타', formatText, description);
}

module.exports = {
  initTemplateStorage,
  parseDocumentFormat,
  saveTemplate,
  listTemplates,
  getTemplate,
  getTemplatesByCategory,
  deleteTemplate,
  registerDefaultTemplates,
  interactiveTemplateInput
};
