'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Search, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DevUser {
  id: number
  loginId: string
  role: string
  repId: number | null
  name: string | null
  status: string
}

/**
 * Dev-only account switcher for fast QA testing.
 * Renders only in development mode.
 */
export function DevSwitcher() {
  const { data: session, status } = useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(true)
  const [users, setUsers] = useState<DevUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch users when panel opens
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dev/switcher/users?search=${encodeURIComponent(search)}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      fetchUsers()
    }
  }, [isOpen, isMinimized, fetchUsers])

  // Debounced search
  useEffect(() => {
    if (!isOpen || isMinimized) return

    const timer = setTimeout(() => {
      fetchUsers()
    }, 300)

    return () => clearTimeout(timer)
  }, [search, isOpen, isMinimized, fetchUsers])

  const handleSwitch = async (userId: number) => {
    setSwitching(userId)
    setError(null)
    try {
      const res = await fetch('/api/dev/switcher/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to switch user')
      }

      const { redirectTo } = await res.json()
      // Hard navigate to force session refresh
      window.location.href = redirectTo
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch user')
      setSwitching(null)
    }
  }

  // Only render in development for admin users
  // (checks moved here to satisfy React hooks rules - hooks must be called unconditionally)
  if (process.env.NODE_ENV !== 'development') {
    return null
  }
  if (session?.user?.role !== 'admin') {
    return null
  }

  const currentUser = session?.user
  const filteredUsers = users.filter(
    (u) => u.id !== Number(currentUser?.id)
  )

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {/* Collapsed state - just show icon */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-amber-950 rounded-full shadow-lg hover:bg-amber-400 transition-colors font-medium text-sm"
          title="Dev Account Switcher"
        >
          <Users className="size-4" />
          <span className="hidden sm:inline">Dev Switch</span>
        </button>
      )}

      {/* Expanded panel */}
      {isOpen && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-80 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-amber-500 text-amber-950">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Users className="size-4" />
              Dev Account Switcher
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 hover:bg-amber-400 rounded"
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-amber-400 rounded"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Current user */}
              <div className="px-3 py-2 border-b border-zinc-700 bg-zinc-800">
                <div className="text-xs text-zinc-400 mb-1">Current Session</div>
                {status === 'loading' ? (
                  <div className="text-sm text-zinc-500">Loading...</div>
                ) : currentUser ? (
                  <div className="text-sm text-zinc-200">
                    <span className="font-medium">{currentUser.loginId || currentUser.name}</span>
                    <span className="ml-2 px-1.5 py-0.5 bg-zinc-700 rounded text-xs uppercase">
                      {currentUser.role}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500">Not logged in</div>
                )}
              </div>

              {/* Search */}
              <div className="px-3 py-2 border-b border-zinc-700">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* User list */}
              <div className="max-h-64 overflow-y-auto">
                {error && (
                  <div className="px-3 py-2 text-red-400 text-sm flex items-center gap-2">
                    <span>{error}</span>
                    <button
                      onClick={fetchUsers}
                      className="p-1 hover:bg-zinc-700 rounded"
                      title="Retry"
                    >
                      <RefreshCw className="size-3" />
                    </button>
                  </div>
                )}

                {loading ? (
                  <div className="px-3 py-4 text-center text-zinc-500 text-sm">
                    Loading users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-zinc-500 text-sm">
                    No users found
                  </div>
                ) : (
                  <ul>
                    {filteredUsers.map((user) => (
                      <li
                        key={user.id}
                        className="px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-zinc-200 truncate">
                              {user.loginId}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-2">
                              <span className={cn(
                                'px-1.5 py-0.5 rounded uppercase',
                                user.role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
                              )}>
                                {user.role}
                              </span>
                              {user.name && user.name !== user.loginId && (
                                <span className="truncate">{user.name}</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleSwitch(user.id)}
                            disabled={switching !== null}
                            className={cn(
                              'ml-2 px-2 py-1 text-xs font-medium rounded transition-colors',
                              switching === user.id
                                ? 'bg-amber-600 text-amber-100 cursor-wait'
                                : 'bg-amber-500 text-amber-950 hover:bg-amber-400'
                            )}
                          >
                            {switching === user.id ? 'Switching...' : 'Switch'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              <div className="px-3 py-2 bg-zinc-800 border-t border-zinc-700 text-xs text-zinc-500">
                Dev only - bypasses auth for testing
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
