import { useState, useEffect } from 'react'
import { organizationApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Select from '../components/Select'

const ALL_ROLES = [
  { value: 'OWNER', label: 'Owner', desc: 'Full billing, user, and workspace administration' },
  { value: 'ADMIN', label: 'Admin', desc: 'Manage users, team members, and view reports' },
  { value: 'RECRUITMENT_MANAGER', label: 'Recruitment Manager', desc: 'Manage recruiters, requisitions, and teams' },
  { value: 'HR_MANAGER', label: 'HR Manager', desc: 'Manage HR team and hiring workflow' },
  { value: 'HR_TEAM', label: 'HR Team Member', desc: 'HR operations reporting to HR Manager' },
  { value: 'ACCOUNT_MANAGER', label: 'Account Manager', desc: 'Client relations and team job requisitions' },
  { value: 'RECRUITER', label: 'Recruiter', desc: 'Manage candidates, jobs, submissions, and AI tools' },
  { value: 'MANAGER', label: 'Manager', desc: 'Departmental management' },
  { value: 'VIEWER', label: 'Viewer', desc: 'Read-only access across company records' },
]

export default function TeamManagement() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ type: '', text: '' })

  // Modal State
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('RECRUITER')
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)

  const isOwnerOrAdmin = ['SUPERADMIN', 'ADMIN', 'OWNER', 'superadmin', 'admin', 'owner'].includes(profile?.role)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [membersRes, invitesRes] = await Promise.all([
        organizationApi.getMembers(),
        organizationApi.getInvitations(),
      ])
      if (membersRes.data) setMembers(membersRes.data)
      if (invitesRes.data) setInvitations(invitesRes.data)
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to load team data' })
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (memberId, newRole) => {
    try {
      const res = await organizationApi.updateMemberRole(memberId, newRole)
      if (res.data) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
        setMsg({ type: 'success', text: 'Member role updated successfully!' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update role' })
    }
  }

  const handleRemoveMember = async (memberId, name) => {
    if (!window.confirm(`Are you sure you want to remove ${name || 'this member'} from the organization?`)) return
    try {
      await organizationApi.removeMember(memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
      setMsg({ type: 'success', text: 'Member removed successfully' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to remove member' })
    }
  }

  const handleSendInvite = async (e) => {
    e.preventDefault()
    setSendingInvite(true)
    setMsg({ type: '', text: '' })
    try {
      const res = await organizationApi.createInvitation(inviteEmail, inviteRole)
      if (res.data) {
        setInvitations(prev => [res.data, ...prev])
        setCreatedInviteUrl(res.invite_url)
        setMsg({ type: 'success', text: `Invitation link created for ${inviteEmail}` })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to create invitation' })
    } finally {
      setSendingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId) => {
    try {
      await organizationApi.revokeInvitation(inviteId)
      setInvitations(prev => prev.filter(i => i.id !== inviteId))
      setMsg({ type: 'success', text: 'Invitation revoked' })
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to revoke invitation' })
    }
  }

  return (
    <div className="team-management-page" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* Header */}
      <div className="workspace-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.5px' }}>Team Management</h1>
          <p style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '4px' }}>Invite team members, assign organizational roles, and manage user access.</p>
        </div>

        {isOwnerOrAdmin && (
          <button
            className="td-btn-accent"
            onClick={() => {
              setShowInviteModal(true)
              setCreatedInviteUrl('')
              setInviteEmail('')
            }}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexShrink: 0
            }}
          >
            <span>➕</span> Invite User
          </button>
        )}
      </div>

      {msg.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '24px',
          fontSize: '14px',
          background: msg.type === 'error' ? 'rgba(255,77,106,0.12)' : 'rgba(34,197,94,0.12)',
          color: msg.type === 'error' ? '#ff4d6a' : '#22c55e',
          border: `1px solid ${msg.type === 'error' ? 'rgba(255,77,106,0.3)' : 'rgba(34,197,94,0.3)'}`
        }}>
          {msg.type === 'error' ? '⚠️ ' : '✅ '}{msg.text}
        </div>
      )}

      {/* Members Table */}
      <div className="team-management-card workspace-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '16px' }}>
          Organization Members ({members.length})
        </h2>

        {loading ? (
          <div style={{ padding: '24px 0', color: 'var(--text3)' }}>Loading team members...</div>
        ) : (
          <>
          <div className="workspace-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '12px 16px' }}>User</th>
                  <th style={{ padding: '12px 16px' }}>Email</th>
                  <th style={{ padding: '12px 16px' }}>Department / Team</th>
                  <th style={{ padding: '12px 16px' }}>Organization Role</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  {isOwnerOrAdmin && <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="workspace-table-row" style={{ borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>
                          {m.full_name ? m.full_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <span style={{ fontWeight: '600', color: 'var(--text)' }}>{m.full_name || 'Unnamed User'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text2)' }}>{m.email}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text3)', fontSize: '13px' }}>
                      {m.department || m.team || 'General'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {isOwnerOrAdmin ? (
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.id, e.target.value)}
                          style={{
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontWeight: '600',
                            outline: 'none'
                          }}
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ background: 'var(--surface2)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700' }}>
                        ACTIVE
                      </span>
                    </td>
                    {isOwnerOrAdmin && (
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleRemoveMember(m.id, m.full_name)}
                          style={{ background: 'transparent', border: 'none', color: '#ff4d6a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list — swaps in for the table below the tablet breakpoint */}
          <div className="workspace-mobile-cards">
            {members.map(m => (
              <div key={m.id} className="workspace-mobile-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '15px' }}>
                    {m.full_name ? m.full_name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name || 'Unnamed User'}</div>
                    <div style={{ color: 'var(--text3)', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                  </div>
                  <span style={{ flexShrink: 0, background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', padding: '3px 8px', borderRadius: '10px', fontSize: '10.5px', fontWeight: '700' }}>
                    ACTIVE
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{m.department || m.team || 'General'}</div>

                  {isOwnerOrAdmin ? (
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.id, e.target.value)}
                      style={{
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: 'var(--text)',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        outline: 'none',
                        maxWidth: '100%'
                      }}
                    >
                      {ALL_ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ background: 'var(--surface2)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>
                      {m.role}
                    </span>
                  )}
                </div>

                {isOwnerOrAdmin && (
                  <button
                    onClick={() => handleRemoveMember(m.id, m.full_name)}
                    style={{ marginTop: '12px', width: '100%', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: '8px', padding: '8px', color: '#ff4d6a', cursor: 'pointer', fontSize: '12.5px', fontWeight: '700' }}
                  >
                    Remove Member
                  </button>
                )}
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Pending Invitations Table */}
      {invitations.length > 0 && (
        <div className="workspace-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '16px' }}>
            Pending Invitations ({invitations.length})
          </h2>

          <div className="workspace-table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '550px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <th style={{ padding: '12px 16px' }}>Invited Email</th>
                <th style={{ padding: '12px 16px' }}>Assigned Role</th>
                <th style={{ padding: '12px 16px' }}>Expires</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map(inv => (
                <tr key={inv.id} className="workspace-table-row" style={{ borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
                  <td style={{ padding: '14px 16px', color: 'var(--text)', fontWeight: '600' }}>{inv.email}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--accent)', fontWeight: '600' }}>{inv.role}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text3)', fontSize: '13px' }}>
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      style={{ background: 'transparent', border: 'none', color: '#ff4d6a', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Mobile card list */}
          <div className="workspace-mobile-cards">
            {invitations.map(inv => (
              <div key={inv.id} className="workspace-mobile-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '700', color: 'var(--text)', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</div>
                    <div style={{ color: 'var(--accent)', fontSize: '12.5px', fontWeight: '600', marginTop: '2px' }}>{inv.role}</div>
                  </div>
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    style={{ flexShrink: 0, background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.25)', borderRadius: '8px', padding: '6px 12px', color: '#ff4d6a', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}
                  >
                    Revoke
                  </button>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text3)' }}>Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={e => e.target === e.currentTarget && setShowInviteModal(false)}>
          <div className="modal-card-responsive" style={{ width: '100%', maxWidth: '480px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', animation: 'slideIn 0.25s ease-out', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>

            <div className="modal-header-responsive" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>Invite Team Member</h2>
              <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="modal-body-responsive" style={{ padding: '20px 32px 32px' }}>
              {!createdInviteUrl ? (
                <form onSubmit={handleSendInvite}>
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Email Address *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      required
                      style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Organization Role *</label>
                    <Select
                      value={inviteRole}
                      onChange={setInviteRole}
                      options={ALL_ROLES}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      style={{ flex: 1, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={sendingInvite}
                      style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: sendingInvite ? 'not-allowed' : 'pointer' }}
                    >
                      {sendingInvite ? 'Generating Link...' : 'Generate Invite Link'}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>Invitation Link Ready</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Share this unique link with {inviteEmail}</p>
                  </div>

                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', fontSize: '13px', wordBreak: 'break-all', color: 'var(--accent)', marginBottom: '20px' }}>
                    {createdInviteUrl}
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteUrl)
                      alert('Invitation URL copied to clipboard!')
                    }}
                    style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    📋 Copy Invite Link
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
