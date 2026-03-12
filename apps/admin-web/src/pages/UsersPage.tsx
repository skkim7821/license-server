import { FormEvent, useState } from "react";
import type { UserRecord } from "../types/api";

type UsersPageProps = {
  users: UserRecord[];
  onCreateUser: (email: string, name?: string) => Promise<void>;
  onUpdateUser: (id: string, email?: string, name?: string) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
};

export function UsersPage({ users, onCreateUser, onUpdateUser, onDeleteUser }: UsersPageProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await onCreateUser(email.trim(), name.trim() || undefined);
    setEmail("");
    setName("");
  }

  async function quickEdit(user: UserRecord) {
    const nextName = prompt(`Edit name for ${user.email}`, user.name ?? "");
    if (nextName === null) {
      return;
    }
    await onUpdateUser(user.id, undefined, nextName.trim() || undefined);
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p>사용자 생성 및 기본 정보 관리</p>
      </header>

      <div className="layout-grid cols-2">
        <form className="card form" onSubmit={submitCreate}>
          <h2>Create / Update User</h2>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="name"
            />
          </label>
          <button type="submit" className="btn">
            Save User
          </button>
        </form>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.name ?? "-"}</td>
                <td>{new Date(user.updatedAt).toLocaleString()}</td>
                <td>
                  <button type="button" className="btn secondary" onClick={() => void quickEdit(user)}>
                    Edit Name
                  </button>
                  <button type="button" className="btn danger" onClick={() => void onDeleteUser(user.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
