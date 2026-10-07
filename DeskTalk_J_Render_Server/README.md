DeskTalk J 중앙 서버 배포 준비본

이 폴더는 바탕화면 앱과 별도로 운영하는 방 서버입니다. 사용자가 같은 서버에 접속하면 서로 다른 네트워크에서도 방 코드를 통해 채팅, 캐릭터 이동과 점프를 공유할 수 있습니다. 배포 설정만 포함하며, 실제 서버는 아직 생성하지 않았습니다.

Render를 연결해 배포할 때는 무료 Web Service 1개와 Singapore 지역을 사용합니다. 유료 플랜, 데이터베이스, 디스크는 필요하지 않습니다. 기본 방 코드는 같은 서버 안에서만 유효합니다.

직접 배포할 때는 GitHub에 새 저장소를 만들고 이 폴더 안의 package.json, package-lock.json, render.yaml, server, tests와 README.md를 저장소 최상위에 업로드합니다. 상위 DeskTalk_J_Render_Server 폴더 자체를 올리지 말고 그 안의 파일을 올리세요. 접속 암호나 개인 설정 파일은 업로드하지 마세요.

Render 대시보드의 New → Web Service에서 해당 저장소를 연결합니다. Runtime은 Node, Region은 Singapore, Build Command는 npm ci --omit=dev, Start Command는 npm start, Instance Type은 Free로 선택합니다. Advanced의 Health Check Path는 /health입니다. New → Blueprint로 저장소의 render.yaml을 적용해도 같습니다. 서비스 이름은 다른 서비스와 중복되지 않게 정합니다.

배포에 성공하면 Render에 표시되는 실제 HTTPS 주소를 사용합니다. 예를 들어 표시된 주소가 https://실제서비스.onrender.com이면 앱에 넣을 주소는 wss://실제서비스.onrender.com입니다. 이 문서의 예시를 실제 주소로 바꿔야 합니다. 공개 주소에는 :8787을 붙이지 않습니다. Render가 HTTPS 인증서와 외부 연결을 처리하고, 서버는 PORT 환경 변수의 포트를 사용합니다.

현재 DeskTalk J에서는 방 입장·생성 화면의 설정 → 연결 서버에 이 wss:// 주소를 저장합니다. 두 컴퓨터가 같은 주소를 사용한 뒤 한 사람이 방 생성, 다른 사람이 방 코드 입력을 하면 됩니다. 주소를 기본으로 넣은 실행 파일은 실제 배포 주소가 확정된 뒤 만들 수 있습니다.

처음에는 서버 접속 암호가 없습니다. 친구들만 접속하게 하려면 Render의 Environment에서 DESKTALK_ACCESS_KEY를 비밀 값으로 지정하고, 앱의 서버 접속 암호에도 같은 값을 입력합니다. 이 값은 저장소나 실행 파일 소스에 포함하지 않습니다. 방 코드는 계정이나 강한 인증을 대신하지 않습니다.

무료 서버는 들어오는 HTTP 요청이나 WebSocket 메시지가 15분간 없으면 잠들 수 있습니다. 다음 접속 시 약 1분의 시작 시간이 필요합니다. 클라우드 접속 패치가 적용된 앱은 최대 95초 동안 연결을 재시도합니다. 서버 재시작·재배포 시 기존 방과 대화 기록은 초기화되므로 새 방을 만들어야 합니다. 정상적으로 배포된 서버는 사용자의 PC를 끈 상태에서도 운영됩니다.

무료 한도 안에서 시작합니다. Render 무료 서비스에도 사용량 제한이 있습니다. 결제 수단이 등록된 계정은 대역폭·빌드 사용량 초과에 따른 과금 가능성이 있으므로 계정의 Billing 설정과 사용량을 확인하세요. 유료 변경은 별도 선택입니다.

로컬 검증은 Node.js 24에서 npm ci, npm test, npm start 순서로 실행합니다. 웹 브라우저에서 http://127.0.0.1:8787/health를 열면 service 값이 desktalk-j로 표시되어야 합니다. 두 앱의 방 코드·채팅 연동은 tests/server.test.js로 검증합니다. 앱의 원격 재시도는 데스크톱 프로젝트 tests/cloud-connection.test.js에서 검증합니다.

Render 공식 안내: https://render.com/docs/web-services
WebSocket 안내: https://render.com/docs/websocket
무료 서버 제한: https://render.com/docs/free
