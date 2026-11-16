# BetterMe (베러미) — 모바일/아이폰용 Next.js PWA 웹앱

**BetterMe**는 아이폰(iOS Safari) 및 모바일 환경에 최적화된 자기계발 & 데일리 루틴 관리 Next.js PWA(Progressive Web App) 웹 애플리케이션입니다.

## 주요 기능

- **모바일 네이티브 UI/UX**: 아이폰 Safe Area(노치/다이내믹 아일랜드 및 홈 인디케이터) 대응, 하단 탭 바 네비게이션, 부드러운 터치 피드백
- **홈 대시보드**: 오늘의 달성률, 연속 달성 스트릭(Streak), 데일리 습관 체크리스트 및 빠른 루틴 완료
- **루틴/습관 관리**: 카테고리별(건강, 마인드풀니스, 생산성, 피트니스) 루틴 추가·필터링 및 실천 기록
- **성장 통계 & 인사이트**: 주간 달성 추이, 카테고리별 밸런스, 성취 배지 확인
- **오프라인 & 로컬 저장소 지원**: `localStorage` 기반으로 별도 회원가입 없이 기기에서 즉시 데이터 유지
- **PWA 지원**: 아이폰 홈 화면에 추가하여 네이티브 앱처럼 전체 화면(`standalone`)으로 실행 가능

---

## 로컬 개발 환경 실행 (`npm run dev`)

```bash
# 의존성 패키지 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드 테스트
npm run build
npm run start
```

---

## GitHub 저장소 업로드 방법

로컬 Git 저장소가 초기화된 상태에서 본인의 GitHub 원격 저장소(Remote Repository)를 연결하고 푸시합니다:

```bash
# GitHub에 새 빈 저장소(예: betterme)를 생성한 뒤 아래 명령어를 실행하세요.
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/betterme.git
git branch -M main
git push -u origin main
```

---

## Vercel 배포 방법 (GitHub 연동 및 CLI)

### 방법 1: GitHub 연동 자동 배포 (권장)
1. [Vercel 대시보드](https://vercel.com/new)에 로그인합니다.
2. **Import Git Repository**에서 방금 푸시한 `betterme` GitHub 저장소를 선택합니다.
3. Framework Preset이 **Next.js**로 자동 감지됩니다 (`vercel.json` 설정 포함).
4. **Deploy** 버튼을 클릭하면 약 1분 내로 HTTPS 도메인(`https://betterme-xxx.vercel.app`)이 발급됩니다. 이후 `main` 브랜치에 푸시할 때마다 자동으로 재배포됩니다.

### 방법 2: Vercel CLI로 즉시 배포 (`npx vercel`)
터미널에서 직접 배포할 수도 있습니다:

```bash
# 미리보기(Preview) 배포
npx vercel

# 프로덕션(Production) 배포
npx vercel --prod
```

---

## 아이폰(iPhone) 홈 화면에 앱으로 추가하는 방법 (Safari)

Vercel 배포 후 발급받은 URL을 아이폰에서 네이티브 앱처럼 사용할 수 있습니다:

1. 아이폰에서 **Safari** 브라우저를 열고 배포된 Vercel URL에 접속합니다.
2. 화면 하단 중앙의 **공유 버튼(네모에서 화살표가 위로 나오는 아이콘)**을 탭합니다.
3. 메뉴를 아래로 스크롤하여 **'홈 화면에 추가(Add to Home Screen)'**를 선택합니다.
4. 우측 상단의 **'추가'**를 탭하면 아이폰 홈 화면에 **BetterMe** 아이콘이 생성됩니다.
5. 홈 화면 아이콘으로 실행하면 상단/하단 Safari 주소창 없이 깔끔한 전체 화면 앱으로 동작합니다.
