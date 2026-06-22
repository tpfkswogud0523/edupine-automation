# K에듀파인 기안문 자동화 시스템

## 📁 파일 구조
```
에듀파인자동화/
├── main.js              ← 메인 실행 (메뉴 UI)
├── automation.js        ← 에듀파인 브라우저 자동화
├── fileParser.js        ← 파일 파싱 (HWP/PDF/DOCX 등)
├── templateManager.js   ← 글 양식 학습/관리
├── aiHelper.js          ← Claude AI 내용 자동 생성
├── .env                 ← 🔑 로그인 정보 (수정 필요!)
├── templates/           ← 저장된 양식들
├── output/              ← 생성된 기안문 저장
└── 에듀파인자동화_실행.bat ← 실행 파일
```

## 🚀 실행 방법
`에듀파인자동화_실행.bat` 더블클릭 또는:
```
cd C:\Users\Administrator\에듀파인자동화
node main.js
```

## ⚙️ 초기 설정
1. `.env` 파일 열기 (메모장)
2. 에듀파인 ID/PW 입력
3. Claude API 키 입력 (https://console.anthropic.com)
4. 학교명/교사명 입력

## 📋 기능 설명

### 1. 기안문 자동 작성
- 글 양식 선택
- 붙임 파일 경로 입력 (HWP, PDF, DOCX, XLSX 등)
- AI가 파일 내용을 분석해서 기안문 자동 완성
- 에듀파인에 자동 입력

### 2. 글 양식 관리
**글 양식 형식 예시:**
```
1. 목적
2. 행사 개요
   가. 일  시:
   나. 장  소:
   다. 대  상:
3. 세부 내용
   가.
   나.
       1)
       2)
4. 예산
붙임. 관련 자료 1부.  끝.
```

기본 제공 양식:
- 현장체험학습 계획
- 방과후학교 운영계획
- 협조 요청
- 특수교육 지원 신청

### 3. 지원 파일 형식
| 형식 | 설명 | 비고 |
|------|------|------|
| .hwp | 아래아한글 | 한컴오피스 설치 시 COM 자동화 |
| .hwpx | 한글 신버전 | ZIP+XML 직접 파싱 |
| .pdf | PDF 문서 | pdf-parse |
| .docx | MS Word | mammoth |
| .xlsx/.xls | Excel | SheetJS |
| .odt | LibreOffice | ZIP+XML |
| .txt/.csv | 텍스트 | EUC-KR/UTF-8 자동 감지 |

## ❗ 에듀파인 자동 입력이 안 될 때
메뉴 4번 "화면 구조 분석" 실행 후 결과를 확인하세요.
에듀파인 UI 업데이트 시 automation.js의 selector를 수정해야 합니다.

## 📌 Claude API 키 발급
1. https://console.anthropic.com 접속
2. 회원가입 / 로그인
3. API Keys → Create Key
4. .env의 ANTHROPIC_API_KEY에 붙여넣기
