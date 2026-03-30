import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWebSocket } from '../../shared/api/websocket'
import ReactMarkdown from 'react-markdown'
import { fetchProviderStatus } from '../../shared/api/provider'

export default function ChatPage() {
  const [input, setInput] = useState('')
  const [providerConfigured, setProviderConfigured] = useState(true)
  const { messages, sendMessage, connected } = useWebSocket()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    let cancelled = false

    async function loadProviderStatus() {
      try {
        const payload = await fetchProviderStatus()
        if (cancelled) {
          return
        }
        setProviderConfigured(payload.active_provider_configured)
      } catch (_error) {
        if (!cancelled) {
          setProviderConfigured(false)
        }
      }
    }

    loadProviderStatus()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !connected) return

    sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <h2 className="text-xl font-semibold">Chat</h2>
      </header>

      {!providerConfigured && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No usable provider is configured yet. Go to{' '}
          <Link to="/settings" className="font-semibold underline">
            Settings
          </Link>
          {' '}and enter an API key or API base. New chat requests will use the updated configuration immediately after you save.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p>Start chatting with RoboClaw</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <ReactMarkdown className="prose prose-invert max-w-none">
                {message.content}
              </ReactMarkdown>
              <div className="text-xs opacity-50 mt-2">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connected ? 'Type a message...' : 'Waiting for connection...'}
            disabled={!connected}
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
