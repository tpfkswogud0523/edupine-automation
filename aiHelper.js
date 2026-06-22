/**
 * Claude AI 기반 기안문 자동 작성 도우미
 * 첨부파일 내용을 분석해서 기안문 양식에 맞게 내용 자동 생성
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      throw new Error(
        'ANTHROPIC_API_KEY가 설정되지 않았습니다.\n' +
        '.env 파일에 API 키를 입력해주세요.\n' +
        '발급: https://console.anthropic.com'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ─────────────────────────────────────────
// 첨부파일 내용 분석 + 기안문 자동 작성
// ─────────────────────────────────────────
async function generateDocumentContent({
  template,       // templateManager.getTemplate()의 결과
  attachedFiles,  // fileParser.parseFiles()의 결과 배열
  schoolInfo,     // { schoolName, teacherName, department }
  additionalHints // 추가 지시사항 (선택)
}) {
  const anthropic = getClient();

  // 첨부파일 텍스트 합치기
  const attachedContent = attachedFiles
    .filter(f => f.success)
    .map(f => `[${f.fileName}]\n${f.text}`)
    .join('\n\n---\n\n');

  const failedFiles = attachedFiles.filter(f => !f.success);

  const systemPrompt = `당신은 대한민국 교사를 돕는 기안문 작성 전문가입니다.
학교 행정 공문 및 기안문 작성에 능숙하며,
공문 형식(한글 맞춤법, 경어체, 간결한 표현)을 잘 알고 있습니다.

학교 정보:
- 학교명: ${schoolInfo.schoolName || ''}
- 담당자: ${schoolInfo.teacherName || ''}
- 부서: ${schoolInfo.department || ''}
- 기준일: ${new Date().toLocaleDateString('ko-KR')}`;

  const userPrompt = `다음 글 양식과 첨부파일 내용을 바탕으로 기안문 본문을 완성해주세요.

【글 양식】
${template.formatText}

【첨부파일 내용】
${attachedContent || '(첨부파일 없음)'}

${additionalHints ? `【추가 지시사항】\n${additionalHints}` : ''}

【작성 규칙】
1. 글 양식의 번호 체계를 그대로 유지하세요 (1. 가. 1) 등)
2. 빈칸(___) 또는 콜론(:) 뒤의 내용을 첨부파일 내용을 참고해서 채워주세요
3. 첨부파일에 없는 내용은 일반적인 학교 공문 형식에 맞게 적절히 작성하세요
4. 날짜, 장소, 대상, 인원 등은 첨부파일에서 찾아서 정확히 입력하세요
5. 공문체(격식체, 명사형 종결)로 작성하세요
6. 제목도 함께 제안해주세요

【출력 형식】
제목: [기안문 제목]

[완성된 본문]`;

  console.log('  🤖 AI가 기안문 내용을 작성 중...');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const responseText = message.content[0].text;

    // 제목과 본문 분리
    const titleMatch = responseText.match(/^제목[:：]\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const body = responseText.replace(/^제목[:：]\s*.+\n?/m, '').trim();

    return {
      success: true,
      title,
      body,
      fullText: responseText,
      failedFiles: failedFiles.map(f => f.fileName),
      usage: message.usage
    };

  } catch (e) {
    if (e.status === 401) {
      throw new Error('API 키가 잘못되었습니다. .env 파일을 확인해주세요.');
    }
    throw new Error(`AI 작성 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// 기안문 제목만 생성 (빠른 제안)
// ─────────────────────────────────────────
async function suggestTitle(templateCategory, attachedContent = '') {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `학교 기안문 제목을 3개 제안해주세요.
카테고리: ${templateCategory}
첨부파일 내용 요약: ${attachedContent.substring(0, 500) || '없음'}

형식: 간결하고 격식있는 공문 제목으로, 번호 없이 제목만 3줄로`
    }]
  });

  return message.content[0].text;
}

// ─────────────────────────────────────────
// 내용 교정 (작성 후 검토)
// ─────────────────────────────────────────
async function reviewDocument(documentText) {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `다음 기안문을 검토하고 수정이 필요한 부분을 알려주세요.

【기안문】
${documentText}

【검토 항목】
1. 맞춤법 및 띄어쓰기
2. 공문 형식 준수 여부
3. 내용의 논리성 및 완결성
4. 빠진 항목
5. 개선 제안`
    }]
  });

  return message.content[0].text;
}

module.exports = {
  generateDocumentContent,
  suggestTitle,
  reviewDocument
};
