# 에이블 취업 트래커 (Able Job Tracker) - Vercel 배포 가이드

에이블 취업 트래커 대시보드를 Vercel에 배포하여, 전 세계 어디서든 고유 도메인(`https://your-project.vercel.app`)을 통해 실시간 채용 공고 열람 및 개인 맞춤 지원현황을 관리할 수 있습니다. (기존 Supabase DB 원장 그대로 연동)

---

## 1. Vercel 환경 변수 설정 (중요)

Vercel 대시보드에서 프로젝트를 생성한 후, **Settings $\rightarrow$ Environment Variables** 메뉴에서 아래 3개 변수를 등록합니다:

| 변수명 (Key) | 설정값 예시 | 설명 |
| :--- | :--- | :--- |
| `SUPABASE_URL` | `https://kthfmifqlcrqfwmbvldk.supabase.co` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase anon public key (클라이언트용) |
| `USER_KEY` | `park_chanyoung` | 본인 취업 트래커 식별자 |

> [!TIP]
> 배포 시 Serverless Function (`/api/config`)이 위 환경 변수를 자동으로 클라이언트에 안전하게 전달하므로, GitHub 저장소에 개인 키 파일(`supabase_config.js`)을 커밋하지 않아도 100% 자동 연결됩니다.

---

## 2. 배포 방법

### 방법 A: GitHub 연동 자동 배포 (추천)
1. GitHub에 새 저장소(예: `able-job-tracker`)를 생성합니다.
2. `c:\sandbox\job-tracker-web` 폴더의 파일들을 Git 저장소에 커밋 & 푸시합니다:
   ```bash
   cd c:\sandbox\job-tracker-web
   git init
   git add .
   git commit -m "feat: Initial commit for Vercel deployment with Supabase"
   git branch -M main
   git remote add origin https://github.com/chanyoung990704/able-job-tracker.git
   git push -u origin main
   ```
3. [Vercel 대시보드](https://vercel.com/dashboard) $\rightarrow$ **Add New Project** 클릭 $\rightarrow$ GitHub 저장소 선택.
4. **Environment Variables**에 위의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_KEY` 입력 후 **Deploy** 클릭!

---

### 방법 B: Vercel CLI 원클릭 배포 (터미널에서 바로 배포)
터미널에서 아래 명령을 실행하면 별도의 Git 푸시 없이도 즉시 Vercel로 업로드되어 배포 URL이 생성됩니다:

```bash
cd c:\sandbox\job-tracker-web
npx vercel
```
* 최초 1회 로그인 (이메일 or GitHub)
* 프롬프트 질문에 기본값(엔터) 선택
* 상용(Production) 배포 시:
  ```bash
  npx vercel --prod
  ```
* 환경 변수 등록:
  ```bash
  npx vercel env add SUPABASE_URL
  npx vercel env add SUPABASE_ANON_KEY
  npx vercel env add USER_KEY
  ```

---

## 3. 프로젝트 구조

```
job-tracker-web/
├── index.html              # 메인 대시보드 (SPA)
├── api/
│   └── config.js           # Vercel Serverless Function (환경변수 주입 엔드포인트)
├── vercel.json             # Vercel 라우팅, 보안 헤더 및 rewrite 규칙
├── package.json            # 프로젝트 메타데이터
├── .env.example            # Vercel 환경 변수 가이드
├── .gitignore              # 보안 파일(supabase_config.js 등) 제외
└── README.md               # 배포 가이드
```
