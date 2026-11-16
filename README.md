# betterme — 매일 운동 기록 스탬프 챌린지

🔗 **Live Web App**: [https://betterme.june8th.net](https://betterme.june8th.net)

**betterme**는 아이폰(iOS Safari) 및 모바일 환경에 최적화된 데일리 운동 기록 스탬프 달력 Next.js PWA(Progressive Web App) 웹 애플리케이션입니다.

## 주요 기능

- **간편 닉네임 시작 & 다중 사용자 전환**: 비밀번호나 회원가입 없이 닉네임만 입력하면 즉시 시작되며, 기기에 저장된 여러 사용자 프로필을 1탭으로 전환해 사용자별 운동 달력을 독립적으로 관리할 수 있습니다.
- **BetterMe 감성 5열 운동 스탬프 달력**: 매월 `Day 1 ~ Day N` 타일을 한눈에 확인하고, 오늘·지난 날짜는 1탭으로 초록색 완료 도장(✓)을 찍거나 수정할 수 있으며 미래 날짜는 자동 잠금(🔒) 처리됩니다.
- **상세 운동 메모 & 연속 달성(Streak) 분석**: 운동 종류(홈트, 러닝·유산소, 웨이트, 스트레칭·요가, 산책·걷기), 운동 시간, 한 줄 메모를 함께 남길 수 있고 총 운동 완료일·현재 연속일·최고 연속일 및 주간 운동 목표를 제공합니다.
- **하이브리드 자동 저장 & 데이터 백업/복원**: 브라우저 `localStorage` 즉시 저장과 `/api/workouts` 서버 동기화를 결합해 빠르고 안정적으로 기록을 보존하며, JSON 클립보드 백업 및 붙여넣기 복원을 지원합니다.
- **모바일 2탭 집중형 레이아웃 & iOS PWA 지원**: 하단 **운동 달력** / **프로필** 2탭 구성과 iPhone Safe Area 대응으로 홈 화면에 추가해 네이티브 앱처럼 사용할 수 있습니다.

---

## 로컬 개발 및 빌드

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드 및 실행
npm run build
npm run start
```

---

## GitHub 푸시 및 Vercel 배포

```bash
git add -A
git commit -m "feat: update betterme workout tracker"
git push origin main
```

1. `main` 브랜치 푸시 시 Vercel과 연결된 공식 도메인([https://betterme.june8th.net](https://betterme.june8th.net))으로 자동 배포됩니다.
2. 신규 연결 시 [Vercel 대시보드](https://vercel.com/new)에서 GitHub `betterme` 저장소를 Import 하면 **Next.js** 프리셋으로 자동 배포되며, 터미널에서 `npx vercel --prod` 명령어로도 즉시 배포할 수 있습니다.

---

## 아이폰(iPhone) 홈 화면에 추가하는 방법 (Safari)

1. 아이폰 **Safari**에서 [https://betterme.june8th.net](https://betterme.june8th.net)에 접속합니다.
2. 하단 **공유 버튼**을 탭한 뒤 **'홈 화면에 추가'**를 선택합니다.
3. 우측 상단 **'추가'**를 누르면 홈 화면 아이콘으로 전체 화면(`standalone`) 실행이 가능합니다.
