import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth-context";

export function AppShell() {
  const { role, clearAuth } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <Link to="/" className="logo">
            License Admin
          </Link>
          <p className="brand-subtitle">Operations Console</p>
        </div>
        <nav className="menu">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/users">Users</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/licenses">Licenses</NavLink>
        </nav>
        <div className="auth-meta">
          <span>Role: {role ?? "-"}</span>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              clearAuth();
              navigate("/login");
            }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="app-main">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
