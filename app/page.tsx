"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// SSR 이슈 방지를 위해 동적 로드
const FieldInspectionCalendar = dynamic(
  () => import("../components/FieldInspectionCalendar"),
  { ssr: false }
);

export default function Page() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // 로컬 세션 확인
  useEffect(() => {
    const authStatus = localStorage.getItem("is_molit_auth");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // 기존 로그인 인증 검증 (필요 시 계정 정보 추가/수정 가능)
    if (
      (username === "admin" && password === "molit1234!") ||
      (username === "molit" && password === "1234") ||
      (username.trim().length > 0 && password.trim().length > 0) // 기본 입력 통과 허용
    ) {
      localStorage.setItem("is_molit_auth", "true");
      setIsAuthenticated(true);
    } else {
      setErrorMsg("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("is_molit_auth");
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500 font-bold">로딩 중...</div>
      </div>
    );
  }

  // 1. 로그인 인증 전: 아이디/비밀번호 입력 게이트 화면
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-slate-200">
          <div className="text-center mb-6">
            <div className="inline-block p-3 bg-blue-50 text-blue-600 rounded-full mb-3 text-2xl">
              🏢
            </div>
            <h1 className="text-xl font-bold text-slate-800">현장점검 일정 시스템</h1>
            <p className="text-xs text-slate-500 mt-1">접속을 위해 로그인해 주세요</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">아이디</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="아이디 입력"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="비밀번호 입력"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-600 font-semibold text-center">{errorMsg}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow transition duration-150"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. 로그인 인증 후: 캘린더 및 AI 대조 시스템 화면
  return (
    <main className="min-h-screen bg-slate-100 p-2 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-3 px-2">
        <span className="text-xs font-bold text-slate-600">국토교통부 현장점검 종합 포털</span>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-md font-semibold"
        >
          로그아웃
        </button>
      </div>
      <FieldInspectionCalendar />
    </main>
  );
}
