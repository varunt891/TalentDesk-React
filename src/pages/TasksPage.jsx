import React, { useState, useEffect, useMemo } from 'react'
import { apiRequest, db } from '../lib/api'
import TaskModal from '../components/TaskModal'

export default function TasksPage({ user, onNavigate }) {
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [jobs, setJobs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [commentsMap, setCommentsMap] = useState({})
  const [loading, setLoading] = useState(true)

  // Filters & State
  const [activeTab, setActiveTab] = useState('today') // 'today' | 'upcoming' | 'overdue' | 'completed' | 'targets' | 'all'
  const [recruiterFilter, setRecruiterFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)

  // Active Task Comment Drawer State
  const [activeCommentTaskId, setActiveCommentTaskId] = useState(null)
  const [newCommentText, setNewCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const userRole = user?.role || 'recruiter'
  const isManager = ['admin', 'superadmin', 'manager'].includes(userRole)

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const [tasksRes, profilesRes, jobsRes, commentsRes] = await Promise.all([
        db.from('tasks').select('*').order('created_at', { ascending: false }),
        db.from('profiles').select('*').order('full_name'),
        db.from('jobs').select('*').order('title'),
        db.from('task_comments').select('*').order('created_at', { ascending: true })
      ])

      setTasks(tasksRes.data || [])
      setProfiles(profilesRes.data || [])
      setJobs(jobsRes.data || [])

      // Map comments by task_id
      const map = {}
      ;(commentsRes.data || []).forEach(c => {
        if (!map[c.task_id]) map[c.task_id] = []
        map[c.task_id].push(c)
      })
      setCommentsMap(map)
    } catch (err) {
      console.error('Error loading task management data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate Overdue & Progress
  const todayStr = new Date().toISOString().slice(0, 10)

  const processedTasks = useMemo(() => {
    return tasks.map(t => {
      let currentStatus = t.status || 'Pending'
      if (currentStatus !== 'Completed' && t.due_date && t.due_date < todayStr) {
        currentStatus = 'Overdue'
      }
      const isTarget = t.target_value !== null && t.target_value !== undefined && t.target_value > 0
      const progressPct = isTarget
        ? Math.min(100, Math.round(((t.current_progress || 0) / t.target_value) * 100))
        : (currentStatus === 'Completed' ? 100 : (currentStatus === 'In Progress' ? 50 : 0))

      return {
        ...t,
        computedStatus: currentStatus,
        isTarget,
        progressPct
      }
    })
  }, [tasks, todayStr])

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    const teamProfileIds = new Set(profiles.map(p => p.id))

    return processedTasks.filter(t => {
      // Role & Team scoping restriction
      if (userRole === 'manager') {
        if (!teamProfileIds.has(t.assigned_to) && !teamProfileIds.has(t.assigned_by)) {
          return false
        }
      } else if (!isManager && t.assigned_to !== user?.id && t.assigned_by !== user?.id) {
        return false
      }

      // Tab filter
      if (activeTab === 'today') {
        if (t.due_date !== todayStr && t.computedStatus === 'Completed') return false
      } else if (activeTab === 'upcoming') {
        if (!t.due_date || t.due_date <= todayStr || t.computedStatus === 'Completed') return false
      } else if (activeTab === 'overdue') {
        if (t.computedStatus !== 'Overdue') return false
      } else if (activeTab === 'completed') {
        if (t.computedStatus !== 'Completed') return false
      } else if (activeTab === 'targets') {
        if (!t.isTarget) return false
      }

      // Manager Dropdown Filters
      if (recruiterFilter !== 'All' && t.assigned_to !== recruiterFilter) return false
      if (statusFilter !== 'All' && t.computedStatus !== statusFilter) return false
      if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false
      if (categoryFilter !== 'All' && t.category !== categoryFilter) return false

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.assigned_to_name?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [processedTasks, isManager, user?.id, activeTab, recruiterFilter, statusFilter, priorityFilter, categoryFilter, searchQuery, todayStr])

  // KPI Computations
  const stats = useMemo(() => {
    const relevant = isManager
      ? processedTasks
      : processedTasks.filter(t => t.assigned_to === user?.id)

    const total = relevant.length
    const pending = relevant.filter(t => t.computedStatus === 'Pending').length
    const inProgress = relevant.filter(t => t.computedStatus === 'In Progress').length
    const completed = relevant.filter(t => t.computedStatus === 'Completed').length
    const overdue = relevant.filter(t => t.computedStatus === 'Overdue').length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0

    return { total, pending, inProgress, completed, overdue, rate }
  }, [processedTasks, isManager, user?.id])

  // Save Task (Create or Edit)
  const handleSaveTask = async (taskPayload, existingId) => {
    if (existingId) {
      // Update
      const res = await db.from('tasks').eq('id', existingId).update(taskPayload)
      if (res.error) throw res.error
      setTasks(prev => prev.map(t => t.id === existingId ? { ...t, ...taskPayload } : t))

      // Trigger Notification
      if (taskPayload.assigned_to && taskPayload.assigned_to !== user?.id) {
        await db.from('notifications').insert({
          user_id: taskPayload.assigned_to,
          title: '📝 Task Updated',
          message: `Manager ${user?.full_name || 'Admin'} updated task: "${taskPayload.title}"`,
          link: '/tasks'
        })
      }
    } else {
      // Create
      const res = await db.from('tasks').insert(taskPayload)
      if (res.error) throw res.error
      if (res.data) {
        const newRow = Array.isArray(res.data) ? res.data[0] : res.data
        setTasks(prev => [newRow, ...prev])

        // Trigger Notification
        if (taskPayload.assigned_to && taskPayload.assigned_to !== user?.id) {
          await db.from('notifications').insert({
            user_id: taskPayload.assigned_to,
            title: '🎯 New Task Assigned',
            message: `Manager ${user?.full_name || 'Admin'} assigned you a new task: "${taskPayload.title}"`,
            link: '/tasks'
          })
        }
      }
    }
  }

  // Status Change
  const handleStatusChange = async (taskId, newStatus) => {
    const targetTask = tasks.find(t => t.id === taskId)
    if (!targetTask) return

    const updates = {
      status: newStatus,
      current_progress: newStatus === 'Completed' && targetTask.target_value ? targetTask.target_value : targetTask.current_progress
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    await db.from('tasks').eq('id', taskId).update(updates)

    // Notify Manager if Recruiter completed task
    if (newStatus === 'Completed' && targetTask.assigned_by && targetTask.assigned_by !== user?.id) {
      await db.from('notifications').insert({
        user_id: targetTask.assigned_by,
        title: '✅ Task Completed',
        message: `${user?.full_name || 'Recruiter'} completed task: "${targetTask.title}"`,
        link: '/tasks'
      })
    }
  }

  // Increment Progress Counter
  const handleIncrementProgress = async (taskId, delta) => {
    const targetTask = tasks.find(t => t.id === taskId)
    if (!targetTask) return

    const newProgress = Math.max(0, (targetTask.current_progress || 0) + delta)
    const isCompleted = targetTask.target_value && newProgress >= targetTask.target_value
    const updates = {
      current_progress: newProgress,
      status: isCompleted ? 'Completed' : (newProgress > 0 ? 'In Progress' : targetTask.status)
    }

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    await db.from('tasks').eq('id', taskId).update(updates)
  }

  // Delete Task (Manager Only)
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await db.from('tasks').eq('id', taskId).delete()
  }

  // Add Comment
  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!activeCommentTaskId || !newCommentText.trim()) return

    setCommentSubmitting(true)
    const payload = {
      task_id: activeCommentTaskId,
      user_id: user?.id || null,
      user_name: user?.full_name || user?.email || 'User',
      comment: newCommentText.trim()
    }

    try {
      const res = await db.from('task_comments').insert(payload)
      const created = Array.isArray(res.data) ? res.data[0] : res.data

      setCommentsMap(prev => ({
        ...prev,
        [activeCommentTaskId]: [...(prev[activeCommentTaskId] || []), created || payload]
      }))
      setNewCommentText('')
    } catch (err) {
      console.error(err)
    } finally {
      setCommentSubmitting(false)
    }
  }

  return (
    <div className="tasks-page">
      {/* Header Banner */}
      <header className="tasks-header">
        <div className="tasks-header-info">
          <div className="tasks-badge">
            <span>🎯 RECRUITER PERFORMANCE & TASK MANAGEMENT</span>
          </div>
          <h1>{isManager ? 'Manager Task & Target Control Center' : 'My Tasks & Daily Performance Targets'}</h1>
          <p>
            {isManager
              ? 'Assign daily recruiter tasks, set performance metrics, monitor team completion rates, and manage priorities.'
              : 'Track assigned daily deliverables, update progress, review target benchmarks, and log completed recruiter activities.'}
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            className="tasks-create-btn"
            onClick={() => {
              setEditingTask(null)
              setIsModalOpen(true)
            }}
          >
            🎯 + Assign New Task / Target
          </button>
        )}
      </header>

      {/* KPI Cards Bar */}
      <section className="tasks-kpi-grid">
        <div className="task-kpi-card blue">
          <span className="kpi-label">TOTAL ASSIGNED</span>
          <strong className="kpi-num">{stats.total}</strong>
          <small>Total tasks in pipeline</small>
        </div>
        <div className="task-kpi-card yellow">
          <span className="kpi-label">PENDING</span>
          <strong className="kpi-num">{stats.pending}</strong>
          <small>Awaiting action</small>
        </div>
        <div className="task-kpi-card purple">
          <span className="kpi-label">IN PROGRESS</span>
          <strong className="kpi-num">{stats.inProgress}</strong>
          <small>Active recruiter tasks</small>
        </div>
        <div className="task-kpi-card green">
          <span className="kpi-label">COMPLETED</span>
          <strong className="kpi-num">{stats.completed}</strong>
          <small>Successfully delivered</small>
        </div>
        <div className="task-kpi-card red">
          <span className="kpi-label">OVERDUE</span>
          <strong className="kpi-num">{stats.overdue}</strong>
          <small>Past due date</small>
        </div>
        <div className="task-kpi-card cyan">
          <span className="kpi-label">COMPLETION RATE</span>
          <strong className="kpi-num">{stats.rate}%</strong>
          <small>Overall team yield</small>
        </div>
      </section>

      {/* Control Filter Bar */}
      <section className="tasks-control-bar">
        <div className="tasks-tabs-row">
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'today' ? 'active' : ''}`}
            onClick={() => setActiveTab('today')}
          >
            📅 Today's Tasks
          </button>
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            ⏳ Upcoming
          </button>
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
            onClick={() => setActiveTab('overdue')}
          >
            🚨 Overdue ({stats.overdue})
          </button>
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            ✅ Completed
          </button>
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'targets' ? 'active' : ''}`}
            onClick={() => setActiveTab('targets')}
          >
            📊 Daily Targets
          </button>
          <button
            type="button"
            className={`tasks-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            📋 All Tasks
          </button>
        </div>

        <div className="tasks-filters-row">
          {isManager && (
            <label className="task-filter-label">
              <span>Recruiter:</span>
              <select value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)}>
                <option value="All">All Recruiters</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
              </select>
            </label>
          )}

          <label className="task-filter-label">
            <span>Status:</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Overdue">Overdue</option>
            </select>
          </label>

          <label className="task-filter-label">
            <span>Priority:</span>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="All">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>

          <div className="task-search-box">
            <input
              type="text"
              placeholder="Search tasks, titles, recruiters..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Main Task List Content */}
      <section className="tasks-list-container">
        {loading ? (
          <div className="tasks-loading-box">
            <div className="loading-pulse" />
            <p>Loading task workspace and recruiter targets...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="tasks-empty-box">
            <div className="empty-icon">🎯</div>
            <h3>No Tasks Found</h3>
            <p>There are no tasks matching your selected filters or active workspace tab.</p>
          </div>
        ) : (
          <div className="task-cards-grid">
            {filteredTasks.map(t => {
              const reqJob = jobs.find(j => j.id === t.req_id)
              const comments = commentsMap[t.id] || []

              return (
                <div key={t.id} className={`task-card status-${t.computedStatus.toLowerCase().replace(/\s+/g, '-')} priority-${t.priority.toLowerCase()}`}>
                  {/* Top Row: Category & Status Badge */}
                  <div className="task-card-top">
                    <span className="task-category-pill">{t.category}</span>
                    <div className="task-status-row">
                      <span className={`task-priority-tag ${t.priority.toLowerCase()}`}>{t.priority}</span>
                      <span className={`task-status-badge ${t.computedStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                        {t.computedStatus}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="task-card-title">{t.title}</h3>
                  {t.description && <p className="task-card-desc">{t.description}</p>}

                  {/* Metadata Row: Assigned To, Due Date, Req */}
                  <div className="task-meta-list">
                    <div className="meta-item">
                      <span className="meta-label">Assigned To:</span>
                      <strong>{t.assigned_to_name || 'Recruiter'}</strong>
                    </div>
                    {t.assigned_by_name && (
                      <div className="meta-item">
                        <span className="meta-label">Assigned By:</span>
                        <span>{t.assigned_by_name}</span>
                      </div>
                    )}
                    {t.due_date && (
                      <div className="meta-item">
                        <span className="meta-label">Due Date:</span>
                        <span className={t.computedStatus === 'Overdue' ? 'text-red' : ''}>{t.due_date}</span>
                      </div>
                    )}
                    {reqJob && (
                      <div className="meta-item">
                        <span className="meta-label">Req Link:</span>
                        <span className="req-pill">📋 {reqJob.title}</span>
                      </div>
                    )}
                  </div>

                  {/* Target Progress Bar */}
                  {t.isTarget && (
                    <div className="task-progress-block">
                      <div className="progress-label-row">
                        <span>Target Metric Progress</span>
                        <strong>
                          {t.current_progress || 0} / {t.target_value} ({t.progressPct}%)
                        </strong>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${t.progressPct}%` }} />
                      </div>
                      <div className="progress-quick-btns">
                        <button type="button" onClick={() => handleIncrementProgress(t.id, 1)}>
                          +1 Increment
                        </button>
                        <button type="button" onClick={() => handleIncrementProgress(t.id, 5)}>
                          +5 Increment
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quick Action Footer */}
                  <div className="task-card-footer">
                    <div className="status-toggle-btns">
                      <button
                        type="button"
                        className={`status-btn pending ${t.computedStatus === 'Pending' ? 'active' : ''}`}
                        onClick={() => handleStatusChange(t.id, 'Pending')}
                      >
                        Pending
                      </button>
                      <button
                        type="button"
                        className={`status-btn progress ${t.computedStatus === 'In Progress' ? 'active' : ''}`}
                        onClick={() => handleStatusChange(t.id, 'In Progress')}
                      >
                        In Progress
                      </button>
                      <button
                        type="button"
                        className={`status-btn completed ${t.computedStatus === 'Completed' ? 'active' : ''}`}
                        onClick={() => handleStatusChange(t.id, 'Completed')}
                      >
                        Completed
                      </button>
                    </div>

                    <div className="task-card-actions">
                      <button
                        type="button"
                        className="comment-toggle-btn"
                        onClick={() => setActiveCommentTaskId(activeCommentTaskId === t.id ? null : t.id)}
                      >
                        💬 Notes ({comments.length})
                      </button>

                      {isManager && (
                        <>
                          <button
                            type="button"
                            className="task-edit-btn"
                            onClick={() => {
                              setEditingTask(t)
                              setIsModalOpen(true)
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="task-delete-btn"
                            onClick={() => handleDeleteTask(t.id)}
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Comment Drawer Section */}
                  {activeCommentTaskId === t.id && (
                    <div className="task-comments-drawer">
                      <div className="comments-header">
                        <h4>💬 Task Notes & Recruiter Log</h4>
                      </div>

                      <div className="comments-list">
                        {comments.length === 0 ? (
                          <p className="no-comments">No comments or progress notes added yet.</p>
                        ) : (
                          comments.map(c => (
                            <div key={c.id} className="comment-item">
                              <div className="comment-author">
                                <strong>{c.user_name || 'Recruiter'}</strong>
                                <small>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                              </div>
                              <p className="comment-text">{c.comment}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleAddComment} className="comment-form">
                        <input
                          type="text"
                          placeholder="Type a task update note..."
                          value={newCommentText}
                          onChange={e => setNewCommentText(e.target.value)}
                          required
                        />
                        <button type="submit" disabled={commentSubmitting}>
                          Post Note
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Modal for Creating / Editing Task */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingTask(null)
        }}
        onSave={handleSaveTask}
        task={editingTask}
        profiles={profiles}
        jobs={jobs}
        currentUser={user}
      />
    </div>
  )
}
