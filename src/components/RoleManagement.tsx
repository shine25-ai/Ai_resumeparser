import React, { useEffect, useState } from "react";
import {
  Shield, Plus, Trash2, Edit2, CheckCircle2, AlertCircle, Users, X, UserPlus, Mail, Lock, User
} from "lucide-react";
import {
  getRoles, createRole, updateRole, deleteRole, getUsers, updateUserRole,
  createUser, updateUser, deleteUser
} from "../utils/Api";
import type { RoleItem, UserProfile } from "../utils/Api";

const AVAILABLE_PERMISSIONS = [
  { id: "dashboard", label: "Dashboard", desc: "Access to overall analytics dashboard" },
  { id: "upload", label: "Upload Resume", desc: "Upload and parse candidate resumes" },
  { id: "database", label: "Candidate Database", desc: "Search and filter talent repository" },
  { id: "evaluation", label: "Evaluation", desc: "Detailed candidate scoring and evaluation" },
  { id: "jd-match", label: "JD Matching", desc: "Match resumes against Job Descriptions" },
  { id: "interviews", label: "Interviews", desc: "Schedule and manage candidate interviews" },
  { id: "interview-dashboard", label: "Interview Dashboard", desc: "Live interview video and feedback portal" },
  { id: "client-feedback", label: "Client Feedback", desc: "Manage client review and approval workflow" },
  { id: "analytics", label: "Analytics & Reports", desc: "Export and view hiring reports" },
  { id: "settings", label: "Settings", desc: "System settings and email configuration" },
  { id: "role-management", label: "Role & User Access", desc: "Manage roles, permissions, and user access" },
];

export default function RoleManagement() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Role Modal State
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    slug: string;
    description: string;
    permissions: string[];
  }>({
    name: "",
    slug: "",
    description: "",
    permissions: [],
  });
  const [savingRole, setSavingRole] = useState<boolean>(false);

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState<{
    full_name: string;
    email: string;
    password: string;
    role: string;
    is_active: boolean;
  }>({
    full_name: "",
    email: "",
    password: "",
    role: "",
    is_active: true,
  });
  const [savingUser, setSavingUser] = useState<boolean>(false);

  // User Role Dropdown Editing state
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fetchedRoles, fetchedUsers] = await Promise.all([
        getRoles().catch(() => []),
        getUsers().catch(() => []),
      ]);
      setRoles(fetchedRoles);
      setUsers(fetchedUsers);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load management data" });
    } finally {
      setLoading(false);
    }
  };

  // ROLE HANDLERS
  const handleOpenCreateRoleModal = () => {
    setEditingRole(null);
    setRoleForm({
      name: "",
      slug: "",
      description: "",
      permissions: [],
    });
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRoleModal = (role: RoleItem) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      slug: role.slug,
      description: role.description || "",
      permissions: role.permissions || [],
    });
    setIsRoleModalOpen(true);
  };

  const togglePermission = (permId: string) => {
    setRoleForm((prev) => {
      const exists = prev.permissions.includes(permId);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== permId)
          : [...prev.permissions, permId],
      };
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim()) return;

    setSavingRole(true);
    setMessage(null);

    try {
      if (editingRole) {
        await updateRole(editingRole.id, {
          name: roleForm.name,
          description: roleForm.description,
          permissions: roleForm.permissions,
        });
        setMessage({ type: "success", text: `Role "${roleForm.name}" updated successfully.` });
      } else {
        await createRole({
          name: roleForm.name,
          slug: roleForm.slug || undefined,
          description: roleForm.description,
          permissions: roleForm.permissions,
        });
        setMessage({ type: "success", text: `Role "${roleForm.name}" created successfully.` });
      }
      setIsRoleModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save role" });
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role: RoleItem) => {
    if (role.is_system) {
      setMessage({ type: "error", text: "Default system roles cannot be deleted." });
      return;
    }

    if (!window.confirm(`Are you sure you want to delete role "${role.name}"?`)) return;

    try {
      await deleteRole(role.id);
      setMessage({ type: "success", text: `Role "${role.name}" deleted.` });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete role" });
    }
  };

  // USER HANDLERS
  const handleOpenCreateUserModal = () => {
    setEditingUser(null);
    setUserForm({
      full_name: "",
      email: "",
      password: "",
      role: roles.length > 0 ? roles[0].slug : "",
      is_active: true,
    });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUserModal = (user: UserProfile) => {
    setEditingUser(user);
    setUserForm({
      full_name: user.full_name,
      email: user.email,
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.full_name.trim() || !userForm.email.trim()) return;

    setSavingUser(true);
    setMessage(null);

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          full_name: userForm.full_name,
          email: userForm.email,
          role: userForm.role,
          is_active: userForm.is_active,
          password: userForm.password ? userForm.password : undefined,
        });
        setMessage({ type: "success", text: `User "${userForm.full_name}" updated successfully.` });
      } else {
        if (!userForm.password) {
          setMessage({ type: "error", text: "Password is required for new user creation." });
          setSavingUser(false);
          return;
        }
        await createUser({
          full_name: userForm.full_name,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          is_active: userForm.is_active,
        });
        setMessage({ type: "success", text: `User "${userForm.full_name}" created successfully.` });
      }
      setIsUserModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save user account" });
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!window.confirm(`Are you sure you want to delete user account "${user.full_name}" (${user.email})?`)) return;

    try {
      await deleteUser(user.id);
      setMessage({ type: "success", text: `User "${user.full_name}" deleted successfully.` });
      await fetchData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete user" });
    }
  };

  const handleUserRoleChange = async (userId: string, newRole: string) => {
    setUpdatingUserId(userId);
    setMessage(null);
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setMessage({ type: "success", text: "User role updated successfully." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to update user role." });
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Status Messages */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${activeTab === "roles"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-semibold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
          >
            <Shield className="w-4 h-4" />
            Roles & Permissions ({roles.length})
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${activeTab === "users"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-semibold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
          >
            <Users className="w-4 h-4" />
            User Accounts & Roles ({users.length})
          </button>
        </div>

        {activeTab === "roles" ? (
          <button
            onClick={handleOpenCreateRoleModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Custom Role
          </button>
        ) : (
          <button
            onClick={handleOpenCreateUserModal}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Create New User
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm ${message.type === "success"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-rose-50 border border-rose-200 text-rose-700"
            }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ROLES TAB TABLE VIEW */}
      {activeTab === "roles" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Role Name & Type</th>
                  <th className="p-4">Slug Code</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Granted Permissions</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {roles.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-bold text-slate-900 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-bold text-slate-900">
                          {role.name}
                        </span>

                        {role.is_system ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700">
                            System Role
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                            Custom
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-600 align-top whitespace-nowrap">
                      <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
                        {role.slug}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-600 align-top max-w-xs">
                      {role.description || <span className="text-slate-400 italic">No description provided</span>}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-wrap gap-1.5 max-w-md">
                        {role.permissions && role.permissions.length > 0 ? (
                          role.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {AVAILABLE_PERMISSIONS.find((p) => p.id === perm)?.label || perm}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No permissions assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditRoleModal(role)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit role"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!role.is_system && (
                          <button
                            onClick={() => handleDeleteRole(role)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete role"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USER ACCOUNTS TABLE VIEW & CRUD */}
      {activeTab === "users" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-xs text-slate-500 uppercase tracking-wider">
                  <th className="p-4">User Details</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Assigned Role</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-bold text-slate-900 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-sky-400 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
                          {u.full_name?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">{u.full_name}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 text-sm text-slate-600 align-top truncate max-w-xs">{u.email}</td>

                    <td className="p-4 align-top">
                      <select
                        value={u.role}
                        disabled={updatingUserId === u.id}
                        onChange={(e) => handleUserRoleChange(u.id, e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.slug}>
                            {r.name} ({r.slug})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="p-4 align-top">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 border border-rose-200 text-rose-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditUserModal(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit user details"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete user account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT ROLE MODAL */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingRole ? `Edit Role: ${editingRole.name}` : "Create Custom Role"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure role details and specific module permissions
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsRoleModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Talent Acquisition Lead"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Role Slug (Code)
                  </label>
                  <input
                    type="text"
                    disabled={!!editingRole}
                    placeholder="e.g. talent_lead (auto-generated if empty)"
                    value={roleForm.slug}
                    onChange={(e) => setRoleForm({ ...roleForm, slug: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Role Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the responsibilities and scope of this role..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Module Access Permissions ({roleForm.permissions.length}/{AVAILABLE_PERMISSIONS.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setRoleForm({
                        ...roleForm,
                        permissions:
                          roleForm.permissions.length === AVAILABLE_PERMISSIONS.length
                            ? []
                            : AVAILABLE_PERMISSIONS.map((p) => p.id),
                      })
                    }
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer"
                  >
                    {roleForm.permissions.length === AVAILABLE_PERMISSIONS.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {AVAILABLE_PERMISSIONS.map((perm) => {
                    const isChecked = roleForm.permissions.includes(perm.id);
                    return (
                      <div
                        key={perm.id}
                        onClick={() => togglePermission(perm.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${isChecked
                          ? "bg-indigo-50/70 border-indigo-300 text-indigo-900"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => { }}
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                        />
                        <div>
                          <div className="font-semibold text-xs">{perm.label}</div>
                          <div className="text-[11px] text-slate-500">{perm.desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRole}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  {savingRole ? "Saving..." : editingRole ? "Update Role" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-600">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingUser ? `Edit User: ${editingUser.full_name}` : "Create New User Account"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configure user credentials, assigned role, and status
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="user@company.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Password {editingUser ? "(Leave blank to keep current password)" : "*"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required={!editingUser}
                    placeholder={editingUser ? "••••••••" : "Enter password (min 6 chars)"}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Assigned System Role *
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.slug}>
                      {r.name} ({r.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Account Active Status</label>
                <button
                  type="button"
                  onClick={() => setUserForm({ ...userForm, is_active: !userForm.is_active })}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${userForm.is_active
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                    : "bg-rose-100 text-rose-700 border border-rose-300"
                    }`}
                >
                  {userForm.is_active ? "Active" : "Inactive"}
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  {savingUser ? "Saving..." : editingUser ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
