export default function Home() {
  // 로그인 상태 관리 (기본값: false)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // 로그인 제출 함수
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // 💡 원하는 아이디와 비밀번호를 지정해 주세요 (예: admin / 1234)
    if (username === "molitdj" && password === "eowjscjd1!") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  // 로그인되지 않은 경우 보여줄 로그인 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full">
          <h1 className="text-xl font-bold text-center mb-6 text-slate-800">
            현장점검 일정 캘린더 로그인
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
                placeholder="아이디 입력"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm outline-none focus:border-blue-500"
                placeholder="비밀번호 입력"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs mt-1">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 로그인 성공 시 기존 캘린더 화면 반환
  return (
    // ... 기존 캘린더 JSX 코드 ...
  );
}
