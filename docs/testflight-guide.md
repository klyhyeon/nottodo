# TestFlight 배포 가이드

NOT TO DO 앱을 TestFlight에 올리기 위한 단계별 가이드.
Vite React SPA → Capacitor → Xcode → TestFlight

---

## 사전 준비

- macOS + Xcode 최신 버전 설치
- Apple Developer Program 등록 ($99/년): https://developer.apple.com/programs/
- Apple ID로 Xcode 로그인 (Xcode > Settings > Accounts)

---

## 1단계: Capacitor 설치 및 초기화

```bash
# Capacitor 설치
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli

# 초기화 (앱 이름, 번들 ID 설정)
npx cap init "NOT TO DO" "com.nottodo.app" --web-dir dist

# iOS 플랫폼 추가
npx cap add ios
```

---

## 2단계: 웹 앱 빌드 및 동기화

```bash
# Vite 프로덕션 빌드
npm run build

# Capacitor에 빌드 결과 동기화
npx cap sync ios
```

> `npm run build` 후 매번 `npx cap sync ios`를 실행해야 최신 코드가 반영됨

---

## 3단계: Xcode 설정

```bash
# Xcode에서 iOS 프로젝트 열기
npx cap open ios
```

Xcode에서:

1. **Signing & Capabilities** 탭
   - Team: 본인 Apple Developer 계정 선택
   - Bundle Identifier: `com.nottodo.app` 확인
   - "Automatically manage signing" 체크

2. **General** 탭
   - Display Name: `낫투두`
   - Version: `1.0.0`
   - Build: `1`

3. **Info.plist** 확인
   - 카메라/사진 등 권한이 필요하면 여기서 추가 (현재 앱은 불필요)

---

## 4단계: Capacitor 설정 (capacitor.config.ts)

프로젝트 루트에 생성된 `capacitor.config.ts`에서 서버 설정 확인:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nottodo.app',
  appName: 'NOT TO DO',
  webDir: 'dist',
  server: {
    // 개발 시 로컬 서버 사용 (배포 시 제거)
    // url: 'http://localhost:5173',
    // cleartext: true,
  },
};

export default config;
```

---

## 5단계: 카카오 로그인 URL scheme 설정

Capacitor iOS에서 카카오 OAuth가 작동하려면:

1. **Xcode > Info > URL Types** 추가:
   - URL Schemes: `kakao{NATIVE_APP_KEY}` (카카오 개발자 콘솔에서 확인)

2. **Supabase 대시보드** > Authentication > URL Configuration:
   - Redirect URLs에 `capacitor://localhost` 추가

3. **auth-store.ts** 수정 — redirectTo를 환경에 따라 분기:

```ts
options: {
  redirectTo: window.location.hostname === 'localhost'
    ? 'capacitor://localhost'
    : window.location.origin,
}
```

---

## 6단계: Archive 및 TestFlight 업로드

1. Xcode 상단에서 디바이스를 **"Any iOS Device (arm64)"** 선택
2. **Product > Archive** (Cmd+Shift+B 아님, Archive임)
3. Archive 완료 후 **Organizer** 창이 열림
4. **Distribute App** 클릭
5. **App Store Connect** 선택 > **Upload**
6. 옵션 기본값으로 진행 > **Upload**

---

## 7단계: App Store Connect에서 TestFlight 설정

1. https://appstoreconnect.apple.com 접속
2. **My Apps** > NOT TO DO 앱 선택 (Archive 업로드 시 자동 생성)
3. **TestFlight** 탭
4. 빌드가 "Processing" 상태 → 몇 분 후 "Ready to Submit"
5. **수출 규정 준수 정보** 질문 답변 (암호화 사용 여부 — HTTPS만 사용하므로 "No" 선택)
6. **내부 테스터** 또는 **외부 테스터** 그룹 생성
   - 내부: Apple Developer 팀 멤버 (최대 25명, 심사 없이 바로 배포)
   - 외부: 이메일로 초대 (최대 10,000명, 첫 빌드만 Apple 심사 필요)
7. 테스터 추가 후 **초대 발송**

---

## 이후 업데이트 시

```bash
# 코드 수정 후
npm run build
npx cap sync ios
# Xcode에서 Build 번호 올리고 Archive > Upload
```

---

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| 빌드 실패: signing 오류 | Xcode > Signing에서 Team 재선택, Automatically manage signing 체크 |
| 카카오 로그인 후 앱으로 안 돌아옴 | URL Scheme 설정 확인, Supabase redirect URL에 `capacitor://localhost` 추가 |
| 흰 화면 | `npm run build` 후 `npx cap sync ios` 했는지 확인 |
| Archive 메뉴 비활성화 | 디바이스를 "Any iOS Device"로 변경 (시뮬레이터 선택 시 비활성화됨) |
| Processing 오래 걸림 | App Store Connect에서 최대 30분 소요 정상 |
