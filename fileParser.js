/**
 * 다양한 파일 형식 파서
 * 지원 형식: HWP, HWPX, PDF, DOCX, XLSX, XLS, TXT, ODT, CSV
 */

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// ─────────────────────────────────────────
// PDF 파싱
// ─────────────────────────────────────────
async function parsePDF(filePath) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    };
  } catch (e) {
    throw new Error(`PDF 파싱 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// DOCX 파싱
// ─────────────────────────────────────────
async function parseDOCX(filePath) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return {
      text: result.value,
      messages: result.messages
    };
  } catch (e) {
    throw new Error(`DOCX 파싱 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// XLSX / XLS 파싱
// ─────────────────────────────────────────
function parseXLSX(filePath) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
      text += `[시트: ${sheetName}]\n${csv}\n\n`;
    });
    return { text };
  } catch (e) {
    throw new Error(`Excel 파싱 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// HWPX 파싱 (ZIP 기반 XML)
// ─────────────────────────────────────────
async function parseHWPX(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    let text = '';
    // HWPX의 본문은 Contents/section*.xml 에 있음
    for (const entry of entries) {
      const name = entry.entryName;
      if (name.startsWith('Contents/') && name.endsWith('.xml')) {
        const xmlContent = entry.getData().toString('utf8');
        // XML 태그 제거, 텍스트만 추출
        const cleaned = xmlContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length > 10) {
          text += cleaned + '\n';
        }
      }
    }
    return { text: text || '(HWPX 내용 없음)' };
  } catch (e) {
    // adm-zip 없는 경우 대비
    throw new Error(`HWPX 파싱 실패 (adm-zip 필요): ${e.message}`);
  }
}

// ─────────────────────────────────────────
// HWP 파싱 (바이너리 포맷)
// ─────────────────────────────────────────
async function parseHWP(filePath) {
  // 방법 1: Windows COM 자동화 (한컴오피스 설치 필요)
  try {
    return await parseHWPviaCOM(filePath);
  } catch (comError) {
    // 방법 2: 바이너리에서 한글 텍스트 직접 추출
    try {
      return parseHWPBinary(filePath);
    } catch (binError) {
      throw new Error(`HWP 파싱 실패\nCOM: ${comError.message}\n바이너리: ${binError.message}`);
    }
  }
}

// HWP COM 자동화 (한컴오피스 설치된 경우)
async function parseHWPviaCOM(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // node-winax 또는 winax로 COM 객체 생성
      let winax;
      try {
        winax = require('winax');
      } catch (e) {
        throw new Error('winax 모듈 없음');
      }

      const hwp = new winax.Object('HWPFrame.HwpObject');
      hwp.XHwpWindows.Item(0).Visible = false;
      hwp.Open(filePath, 'HWP', 'forceopen:true');

      const text = hwp.GetTextFile('TEXT', 'selectall:true');
      hwp.Quit();

      resolve({ text: text || '' });
    } catch (e) {
      reject(e);
    }
  });
}

// HWP 바이너리 직접 파싱 (한글 2바이트 문자 추출)
function parseHWPBinary(filePath) {
  const buf = fs.readFileSync(filePath);

  // HWP 파일 시그니처 확인
  const sig = buf.slice(0, 32).toString('ascii');
  if (!sig.includes('HWP Document File')) {
    throw new Error('HWP 파일 형식이 아닙니다');
  }

  // EUC-KR / CP949 로 디코딩하여 한글 텍스트 추출
  try {
    const decoded = iconv.decode(buf, 'cp949');
    // 출력 가능한 문자만 추출
    const lines = decoded
      .split('\n')
      .map(line => line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim())
      .filter(line => line.length > 2 && /[가-힣a-zA-Z0-9]/.test(line));

    return { text: lines.join('\n'), note: '(바이너리 직접 추출 - 일부 내용 누락 가능)' };
  } catch (e) {
    throw new Error(`인코딩 변환 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// TXT / CSV 파싱
// ─────────────────────────────────────────
function parseTXT(filePath) {
  try {
    // EUC-KR / UTF-8 자동 감지
    const rawBuf = fs.readFileSync(filePath);
    let text;
    try {
      // UTF-8 먼저 시도
      text = rawBuf.toString('utf8');
      if (text.includes('')) throw new Error('not utf8');
    } catch (e) {
      // EUC-KR (CP949) 시도
      text = iconv.decode(rawBuf, 'cp949');
    }
    return { text };
  } catch (e) {
    throw new Error(`TXT 파싱 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// ODT 파싱 (OpenDocument Text - ZIP 기반)
// ─────────────────────────────────────────
async function parseODT(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const contentEntry = zip.getEntry('content.xml');
    if (!contentEntry) throw new Error('content.xml 없음');

    const xmlContent = contentEntry.getData().toString('utf8');
    const text = xmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { text };
  } catch (e) {
    throw new Error(`ODT 파싱 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────
// 메인 파서 (확장자 자동 감지)
// ─────────────────────────────────────────
async function parseFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  console.log(`  📄 파일 파싱 중: ${fileName} (${ext})`);

  let result;
  switch (ext) {
    case '.pdf':
      result = await parsePDF(filePath);
      break;
    case '.docx':
    case '.doc':
      result = await parseDOCX(filePath);
      break;
    case '.xlsx':
    case '.xls':
      result = parseXLSX(filePath);
      break;
    case '.hwpx':
      result = await parseHWPX(filePath);
      break;
    case '.hwp':
      result = await parseHWP(filePath);
      break;
    case '.odt':
      result = await parseODT(filePath);
      break;
    case '.txt':
    case '.csv':
      result = parseTXT(filePath);
      break;
    default:
      // 알 수 없는 형식: 텍스트로 시도
      try {
        result = parseTXT(filePath);
      } catch (e) {
        throw new Error(`지원하지 않는 파일 형식: ${ext}`);
      }
  }

  return {
    fileName,
    filePath,
    extension: ext,
    ...result,
    text: (result.text || '').substring(0, 10000) // 최대 1만자
  };
}

// 여러 파일 파싱
async function parseFiles(filePaths) {
  const results = [];
  for (const fp of filePaths) {
    try {
      const parsed = await parseFile(fp);
      results.push({ success: true, ...parsed });
    } catch (e) {
      results.push({ success: false, fileName: path.basename(fp), error: e.message });
    }
  }
  return results;
}

module.exports = { parseFile, parseFiles };
