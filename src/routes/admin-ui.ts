import { FastifyInstance, FastifyPluginAsync } from "fastify";

const adminUiHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>License Admin UI</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --panel: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --line: #dbe2ea;
      --brand: #0f766e;
      --danger: #b91c1c;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", "Noto Sans KR", sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, #edf4ff 0%, var(--bg) 100%);
    }
    .wrap {
      max-width: 1100px;
      margin: 24px auto;
      padding: 0 16px;
      display: grid;
      gap: 16px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
    }
    h1,h2 {
      margin: 0 0 12px 0;
    }
    h1 { font-size: 22px; }
    h2 { font-size: 17px; }
    .row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 8px;
    }
    .row.one { grid-template-columns: 1fr; }
    input, select, button, textarea {
      box-sizing: border-box;
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--line);
      padding: 10px;
      font-size: 14px;
      background: #fff;
    }
    button {
      cursor: pointer;
      background: var(--brand);
      color: #fff;
      border: 1px solid transparent;
    }
    button.secondary {
      background: #fff;
      color: var(--text);
      border-color: var(--line);
    }
    button.danger {
      background: var(--danger);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    .muted { color: var(--muted); font-size: 12px; }
    #status {
      white-space: pre-wrap;
      font-size: 13px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f8fafc;
      min-height: 42px;
    }
    @media (max-width: 900px) {
      .row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h1>License Admin UI</h1>
      <p class="muted">최소 운영용 UI입니다. API 기준으로 로그인/조회/수정 액션을 수행합니다.</p>
      <div class="row">
        <input id="adminEmail" type="email" placeholder="admin@example.com" />
        <input id="adminPassword" type="password" placeholder="password" />
        <button id="loginBtn">로그인</button>
        <button id="logoutBtn" class="secondary">로그아웃</button>
      </div>
      <div class="row one">
        <textarea id="tokenBox" rows="2" placeholder="Bearer 토큰"></textarea>
      </div>
      <div id="status">준비됨</div>
    </div>

    <div class="panel">
      <h2>사용자 관리</h2>
      <div class="row">
        <input id="newUserEmail" type="email" placeholder="user@example.com" />
        <input id="newUserName" type="text" placeholder="name (optional)" />
        <button id="createUserBtn">사용자 생성/수정</button>
        <button id="refreshUsersBtn" class="secondary">사용자 목록 새로고침</button>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Updated</th></tr></thead>
        <tbody id="usersBody"></tbody>
      </table>
    </div>

    <div class="panel">
      <h2>라이선스 관리</h2>
      <div class="row">
        <button id="refreshLicensesBtn" class="secondary">라이선스 목록 새로고침</button>
      </div>
      <table>
        <thead><tr><th>ID</th><th>License Key</th><th>Email</th><th>Status</th><th>ExpiresAt</th><th>Action</th></tr></thead>
        <tbody id="licensesBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    const statusEl = document.getElementById("status");
    const tokenBox = document.getElementById("tokenBox");
    const usersBody = document.getElementById("usersBody");
    const licensesBody = document.getElementById("licensesBody");

    const TOKEN_KEY = "license_admin_token";
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) tokenBox.value = savedToken;

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function getToken() {
      const token = tokenBox.value.trim();
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      return token;
    }

    async function api(path, options = {}) {
      const token = getToken();
      const hasBody = options.body !== undefined;
      const baseHeaders = hasBody ? { "content-type": "application/json" } : {};
      const headers = Object.assign(baseHeaders, options.headers || {});
      if (token) headers.authorization = "Bearer " + token;
      const response = await fetch(path, Object.assign({}, options, { headers }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data && (data.error || data.reason)) ? (data.error || data.reason) : ("HTTP " + response.status));
      }
      return data;
    }

    function escapeHtml(v) {
      return String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }

    async function login() {
      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value.trim();
      try {
        const data = await api("/admin/login", {
          method: "POST",
          headers: { authorization: "" },
          body: JSON.stringify({ email, password }),
        });
        tokenBox.value = data.token;
        localStorage.setItem(TOKEN_KEY, data.token);
        setStatus("로그인 성공 (" + data.type + ", role=" + data.role + ")");
      } catch (error) {
        setStatus("로그인 실패: " + error.message);
      }
    }

    function logout() {
      tokenBox.value = "";
      localStorage.removeItem(TOKEN_KEY);
      setStatus("로그아웃됨");
    }

    async function refreshUsers() {
      try {
        const data = await api("/admin/users", { method: "GET" });
        usersBody.innerHTML = data.users.map((user) => {
          return "<tr><td>" + escapeHtml(user.id) + "</td><td>" + escapeHtml(user.email) + "</td><td>" + escapeHtml(user.name || "") + "</td><td>" + escapeHtml(user.updatedAt) + "</td></tr>";
        }).join("");
        setStatus("사용자 " + data.users.length + "건 로드");
      } catch (error) {
        setStatus("사용자 조회 실패: " + error.message);
      }
    }

    async function createUser() {
      const email = document.getElementById("newUserEmail").value.trim();
      const name = document.getElementById("newUserName").value.trim();
      if (!email) {
        setStatus("사용자 이메일이 필요합니다.");
        return;
      }
      try {
        await api("/admin/users", {
          method: "POST",
          body: JSON.stringify({ email, name }),
        });
        setStatus("사용자 저장 완료: " + email);
        await refreshUsers();
      } catch (error) {
        setStatus("사용자 저장 실패: " + error.message);
      }
    }

    function renderLicenseRow(license) {
      const safeId = escapeHtml(license.id);
      const safeKey = escapeHtml(license.licenseKey);
      const safeEmail = escapeHtml(license.email);
      const safeStatus = escapeHtml(license.status);
      const safeExpires = escapeHtml(license.expiresAt);

      return "<tr>" +
        "<td>" + safeId + "</td>" +
        "<td>" + safeKey + "</td>" +
        "<td>" + safeEmail + "</td>" +
        "<td>" + safeStatus + "</td>" +
        "<td>" + safeExpires + "</td>" +
        "<td>" +
          "<button class='secondary js-license-action' data-action='extend' data-id='" + safeId + "'>+30일</button> " +
          "<button class='secondary js-license-action' data-action='set-status' data-id='" + safeId + "' data-status='active'>active</button> " +
          "<button class='secondary js-license-action' data-action='set-status' data-id='" + safeId + "' data-status='expired'>expired</button> " +
          "<button class='secondary js-license-action' data-action='set-status' data-id='" + safeId + "' data-status='revoked'>revoked</button> " +
          "<button class='danger js-license-action' data-action='delete' data-id='" + safeId + "'>delete</button>" +
        "</td>" +
      "</tr>";
    }

    async function refreshLicenses() {
      try {
        const data = await api("/admin/licenses", { method: "GET" });
        licensesBody.innerHTML = data.licenses.map(renderLicenseRow).join("");
        setStatus("라이선스 " + data.licenses.length + "건 로드");
      } catch (error) {
        setStatus("라이선스 조회 실패: " + error.message);
      }
    }

    async function extendLicense(id) {
      try {
        await api("/admin/licenses/" + encodeURIComponent(id) + "/extend", {
          method: "PATCH",
          body: JSON.stringify({ days: 30 }),
        });
        setStatus("라이선스 연장 완료: " + id);
        await refreshLicenses();
      } catch (error) {
        setStatus("연장 실패: " + error.message);
      }
    }

    async function setLicenseStatus(id, status) {
      try {
        await api("/admin/licenses/" + encodeURIComponent(id) + "/status", {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setStatus("상태 변경 완료: " + id + " -> " + status);
        await refreshLicenses();
      } catch (error) {
        setStatus("상태 변경 실패: " + error.message);
      }
    }

    async function deleteLicense(id) {
      if (!confirm("삭제하시겠습니까? " + id)) return;
      try {
        await api("/admin/licenses/" + encodeURIComponent(id), { method: "DELETE" });
        setStatus("라이선스 삭제 완료: " + id);
        await refreshLicenses();
      } catch (error) {
        setStatus("삭제 실패: " + error.message);
      }
    }

    document.getElementById("loginBtn").addEventListener("click", login);
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("refreshUsersBtn").addEventListener("click", refreshUsers);
    document.getElementById("createUserBtn").addEventListener("click", createUser);
    document.getElementById("refreshLicensesBtn").addEventListener("click", refreshLicenses);
    licensesBody.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest(".js-license-action");
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (!id || !action) {
        return;
      }
      if (action === "extend") {
        await extendLicense(id);
        return;
      }
      if (action === "delete") {
        await deleteLicense(id);
        return;
      }
      if (action === "set-status") {
        const status = button.dataset.status;
        if (status === "active" || status === "expired" || status === "revoked") {
          await setLicenseStatus(id, status);
        }
      }
    });
  </script>
</body>
</html>`;

const registerAdminUiRoute = (fastify: FastifyInstance) => {
  fastify.get("/admin-ui", async (_, reply) => {
    return reply.type("text/html; charset=utf-8").send(adminUiHtml);
  });
};

export const adminUiRoutes: FastifyPluginAsync = async (fastify) => {
  registerAdminUiRoute(fastify);
};
