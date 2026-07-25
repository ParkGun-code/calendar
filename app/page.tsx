"use client";

import { useState } from "react";

export default function Home() {
  // 로그인 상태 관리
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // 로그인 제출 함수
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // 💡 로그인 아이디 / 비밀번호 설정
    if (username === "molitdj" && password === "eowjscjd1!") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  // 1. 로그인 전 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full border border-slate-200">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-slate-800">
              현장점검 일정 캘린더
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              접근 권한이 필요합니다. 아이디와 비밀번호를 입력하세요.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition"
                placeholder="아이디 입력"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition"
                placeholder="비밀번호 입력"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs font-medium mt-1">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. 로그인 성공 후 기존 캘린더 화면
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 상단 헤더 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              현장점검 일정 캘린더
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              엑셀 파일(.xlsx)을 올리면 아래 캘린더에 조별로 즉시 표시됩니다.
            </p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ↑ 엑셀 파일 선택
          </button>
        </div>

        {/* 필터 영역 */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">조별 필터:</span>
            <select className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="all">전체 보기</option>
            </select>
          </div>
        </div>
      </div>
    </main>
  );
}
