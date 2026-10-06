import React, { useState } from 'react';
import {
  Radio,
  Plus,
  Trash2,
  Send,
  Download,
  CheckCircle2,
  AlertTriangle,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
  Copy,
  Check,
  X,
  FileText,
  Clock,
  ShieldAlert,
  Info,
  ChevronRight,
  Inbox,
  Filter,
} from 'lucide-react';
import { useLocalCloud } from '../../../context/LocalCloudContext';
import { PubSubTopic, PubSubSubscription, PubSubMessage, PulledMessage } from '../../../types';

type PubSubTab = 'topics' | 'subscriptions' | 'deadletter';

export const PubSubView: React.FC<{ initialTab?: PubSubTab }> = ({ initialTab = 'topics' }) => {
  const {
    pubsubTopics,
    pubsubSubscriptions,
    pubsubMessages,
    deadLetterMessages,
    createPubsubTopic,
    deletePubsubTopic,
    createPubsubSubscription,
    deletePubsubSubscription,
    publishPubsubMessage,
    pullPubsubMessages,
    ackPubsubMessage,
    nackPubsubMessage,
    currentProject,
    showToast,
  } = useLocalCloud();

  const [activeTab, setActiveTab] = useState<PubSubTab>(initialTab);
  const [selectedTopic, setSelectedTopic] = useState<PubSubTopic | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<PubSubSubscription | null>(null);

  // Modals
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);
  const [isCreateSubOpen, setIsCreateSubOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  // Create Topic form
  const [newTopicName, setNewTopicName] = useState('');
  const [topicRetentionDays, setTopicRetentionDays] = useState(7);

  // Create Sub form
  const [newSubName, setNewSubName] = useState('');
  const [subTopicName, setSubTopicName] = useState(pubsubTopics[0]?.name || 'order-events');
  const [subDeliveryType, setSubDeliveryType] = useState<'PULL' | 'PUSH'>('PULL');
  const [subAckDeadline, setSubAckDeadline] = useState(10);
  const [subDeadLetterTopic, setSubDeadLetterTopic] = useState('');
  const [subMaxDeliveryAttempts, setSubMaxDeliveryAttempts] = useState(5);

  // Publish Message form
  const [publishPayload, setPublishPayload] = useState('{\n  "message": "Hello from LocalCloud Pub/Sub",\n  "timestamp": "' + new Date().toISOString() + '"\n}');
  const [attrKey, setAttrKey] = useState('environment');
  const [attrVal, setAttrVal] = useState('development');
  const [customAttrs, setCustomAttrs] = useState<Record<string, string>>({ environment: 'development', priority: 'high' });
  const [orderingKey, setOrderingKey] = useState('');

  // Pulling messages state
  const [pulledMessages, setPulledMessages] = useState<PulledMessage[]>([]);
  const [isPulling, setIsPulling] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    const t = createPubsubTopic(newTopicName, topicRetentionDays);
    setNewTopicName('');
    setIsCreateTopicOpen(false);
    setSelectedTopic(t);
  };

  const handleCreateSub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const s = createPubsubSubscription({
      name: newSubName.trim().toLowerCase(),
      topicName: subTopicName,
      deliveryType: subDeliveryType,
      ackDeadlineSeconds: subAckDeadline,
      deadLetterTopic: subDeadLetterTopic || undefined,
      maxDeliveryAttempts: subMaxDeliveryAttempts,
    });
    setNewSubName('');
    setIsCreateSubOpen(false);
    setSelectedSubscription(s);
  };

  const handlePublishMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTopic = selectedTopic?.name || pubsubTopics[0]?.name;
    if (!targetTopic) return;

    publishPubsubMessage(targetTopic, publishPayload, customAttrs, orderingKey || undefined);
    setIsPublishOpen(false);
    showToast(`Published message to ${targetTopic}`);
  };

  const handlePull = (subName: string) => {
    setIsPulling(true);
    setTimeout(() => {
      const messages = pullPubsubMessages(subName, 10);
      setPulledMessages(messages);
      setIsPulling(false);
      showToast(messages.length > 0 ? `Pulled ${messages.length} message(s)` : 'No unacknowledged messages');
    }, 400);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
              Pub/Sub
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
              Enterprise Messaging
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Asynchronous many-to-many messaging service that decouples message senders and receivers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'topics' && (
            <button
              onClick={() => setIsCreateTopicOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create topic</span>
            </button>
          )}

          {activeTab === 'subscriptions' && (
            <button
              onClick={() => setIsCreateSubOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create subscription</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-[var(--border-color)] text-xs font-medium">
        {[
          { id: 'topics', label: `Topics (${pubsubTopics.length})`, icon: Radio },
          { id: 'subscriptions', label: `Subscriptions (${pubsubSubscriptions.length})`, icon: Inbox },
          { id: 'deadletter', label: `Dead-letter Queues (${deadLetterMessages.length})`, icon: ShieldAlert },
        ].map(t => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => {
                setActiveTab(t.id as any);
                setSelectedTopic(null);
                setSelectedSubscription(null);
                setPulledMessages([]);
              }}
              className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                isActive
                  ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] font-semibold'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: TOPICS */}
      {activeTab === 'topics' && (
        <div className="space-y-6">
          {selectedTopic ? (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Topic Details Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <div>
                  <button
                    onClick={() => setSelectedTopic(null)}
                    className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1 mb-1"
                  >
                    ← All topics
                  </button>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Radio className="w-5 h-5 text-[var(--accent-blue)]" />
                    <span>projects/{currentProject.projectId}/topics/{selectedTopic.name}</span>
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Retention: {selectedTopic.retentionDays} days • Total published: {selectedTopic.messageCount} messages
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPublishOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish message</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Delete topic ${selectedTopic.name}?`)) {
                        deletePubsubTopic(selectedTopic.id);
                        setSelectedTopic(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Subscriptions attached to this topic */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                    Subscriptions to this Topic
                  </h3>
                  <button
                    onClick={() => {
                      setSubTopicName(selectedTopic.name);
                      setIsCreateSubOpen(true);
                    }}
                    className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add subscription</span>
                  </button>
                </div>

                <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden">
                  {pubsubSubscriptions.filter(s => s.topicName === selectedTopic.name).length === 0 ? (
                    <div className="py-10 text-center text-xs text-[var(--text-muted)] space-y-2">
                      <Inbox className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
                      <p>No subscriptions attached to this topic yet.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                        <tr>
                          <th className="py-3 px-4">Subscription name</th>
                          <th className="py-3 px-4">Delivery type</th>
                          <th className="py-3 px-4">Ack deadline</th>
                          <th className="py-3 px-4">Dead-letter topic</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                        {pubsubSubscriptions
                          .filter(s => s.topicName === selectedTopic.name)
                          .map(sub => (
                            <tr key={sub.id} className="hover:bg-[var(--card-hover)] transition-colors">
                              <td className="py-3 px-4 font-sans font-semibold text-[var(--accent-blue)]">
                                {sub.name}
                              </td>
                              <td className="py-3 px-4">{sub.deliveryType}</td>
                              <td className="py-3 px-4">{sub.ackDeadlineSeconds}s</td>
                              <td className="py-3 px-4">
                                {sub.deadLetterTopic ? (
                                  <span className="text-amber-400">{sub.deadLetterTopic}</span>
                                ) : (
                                  <span className="text-[var(--text-muted)]">None</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-sans">
                                <button
                                  onClick={() => {
                                    setActiveTab('subscriptions');
                                    setSelectedSubscription(sub);
                                    handlePull(sub.name);
                                  }}
                                  className="px-2.5 py-1 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] hover:border-[var(--accent-blue)]"
                                >
                                  Pull Messages
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Topic name</th>
                    <th className="py-3 px-4">Subscriptions</th>
                    <th className="py-3 px-4">Message retention</th>
                    <th className="py-3 px-4">Published count</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {pubsubTopics.map(topic => {
                    const subCount = pubsubSubscriptions.filter(s => s.topicName === topic.name).length;
                    return (
                      <tr
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic)}
                        className="cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-sans">
                          <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                            <span className="font-semibold text-[var(--accent-blue)] hover:underline">
                              {topic.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-sans text-[var(--text-secondary)]">
                          {subCount} subscription(s)
                        </td>
                        <td className="py-3.5 px-4 text-[var(--text-secondary)]">
                          {topic.retentionDays} days
                        </td>
                        <td className="py-3.5 px-4 text-[var(--text-primary)]">
                          {topic.messageCount}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setSelectedTopic(topic);
                              setIsPublishOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] hover:border-[var(--accent-blue)] font-sans mr-2"
                          >
                            Publish
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete topic ${topic.name}?`)) {
                                deletePubsubTopic(topic.id);
                              }
                            }}
                            className="p-1 hover:text-[var(--danger)] text-[var(--text-muted)]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS & PULL */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          {selectedSubscription ? (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Subscription Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <div>
                  <button
                    onClick={() => {
                      setSelectedSubscription(null);
                      setPulledMessages([]);
                    }}
                    className="text-xs text-[var(--accent-blue)] hover:underline flex items-center gap-1 mb-1"
                  >
                    ← All subscriptions
                  </button>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-[var(--accent-blue)]" />
                    <span>{selectedSubscription.name}</span>
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
                    Topic: <span className="text-[var(--text-primary)]">{selectedSubscription.topicName}</span> • Type: {selectedSubscription.deliveryType} • Ack Deadline: {selectedSubscription.ackDeadlineSeconds}s
                    {selectedSubscription.deadLetterTopic && (
                      <span className="text-amber-400 ml-2">
                        • Dead-letter: {selectedSubscription.deadLetterTopic} (max {selectedSubscription.maxDeliveryAttempts} attempts)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePull(selectedSubscription.name)}
                    disabled={isPulling}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${isPulling ? 'animate-bounce' : ''}`} />
                    <span>{isPulling ? 'Pulling...' : 'Pull messages'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Delete subscription ${selectedSubscription.name}?`)) {
                        deletePubsubSubscription(selectedSubscription.id);
                        setSelectedSubscription(null);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 text-xs font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Messages Pull UI */}
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Pulled Messages in Queue ({pulledMessages.length})
                  </span>
                  <span className="text-[var(--text-muted)]">
                    Click ACK to acknowledge receipt or NACK to return/route to dead-letter queue.
                  </span>
                </div>

                {pulledMessages.length === 0 ? (
                  <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] p-12 text-center space-y-3">
                    <Inbox className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
                    <div className="space-y-1">
                      <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                        No messages currently pulled
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                        Click &quot;Pull messages&quot; above to fetch available unacknowledged messages published to topic &quot;{selectedSubscription.topicName}&quot;.
                      </p>
                    </div>
                    <button
                      onClick={() => handlePull(selectedSubscription.name)}
                      className="px-4 py-1.5 rounded-lg bg-[var(--accent-blue)] text-black font-semibold text-xs hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Pull messages now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pulledMessages.map(p => (
                      <div
                        key={p.ackId}
                        className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-[var(--text-secondary)]">ID:</span>
                            <span className="text-[var(--accent-blue)] font-bold">{p.message.id}</span>
                            <button
                              onClick={() => handleCopy(p.message.id, p.message.id)}
                              className="p-1 hover:text-[var(--text-primary)] text-[var(--text-muted)]"
                              title="Copy ID"
                            >
                              {copiedMsgId === p.message.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <span className="text-[var(--text-muted)]">•</span>
                            <span className="text-[var(--text-muted)]">
                              Attempt {p.deliveryAttempt} of {selectedSubscription.maxDeliveryAttempts}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                ackPubsubMessage(selectedSubscription.name, p.ackId);
                                setPulledMessages(prev => prev.filter(m => m.ackId !== p.ackId));
                              }}
                              className="px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-semibold transition-colors flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ACK</span>
                            </button>

                            <button
                              onClick={() => {
                                nackPubsubMessage(selectedSubscription.name, p.ackId);
                                setPulledMessages(prev => prev.filter(m => m.ackId !== p.ackId));
                              }}
                              className="px-3 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-semibold transition-colors flex items-center gap-1"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>NACK (Retry)</span>
                            </button>
                          </div>
                        </div>

                        {/* Payload */}
                        <div className="space-y-1">
                          <span className="font-semibold text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">
                            Decoded Message Payload:
                          </span>
                          <pre className="p-3 rounded-lg bg-black text-neutral-300 font-mono text-xs overflow-x-auto max-h-48 border border-neutral-800 leading-relaxed">
                            {p.message.data}
                          </pre>
                        </div>

                        {/* Attributes */}
                        {p.message.attributes && Object.keys(p.message.attributes).length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                            <span className="text-[var(--text-muted)]">Attributes:</span>
                            {Object.entries(p.message.attributes).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                              >
                                {k}={v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Subscription name</th>
                    <th className="py-3 px-4">Topic</th>
                    <th className="py-3 px-4">Delivery type</th>
                    <th className="py-3 px-4">Ack deadline</th>
                    <th className="py-3 px-4">Dead-letter topic</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {pubsubSubscriptions.map(sub => (
                    <tr
                      key={sub.id}
                      onClick={() => {
                        setSelectedSubscription(sub);
                        handlePull(sub.name);
                      }}
                      className="cursor-pointer hover:bg-[var(--card-hover)] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-sans">
                        <div className="flex items-center gap-2">
                          <Inbox className="w-4 h-4 text-[var(--accent-blue)] shrink-0" />
                          <span className="font-semibold text-[var(--accent-blue)] hover:underline">
                            {sub.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)]">{sub.topicName}</td>
                      <td className="py-3.5 px-4">{sub.deliveryType}</td>
                      <td className="py-3.5 px-4 text-[var(--text-secondary)]">{sub.ackDeadlineSeconds}s</td>
                      <td className="py-3.5 px-4">
                        {sub.deadLetterTopic ? (
                          <span className="text-amber-400">{sub.deadLetterTopic}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">None</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedSubscription(sub);
                            handlePull(sub.name);
                          }}
                          className="px-2.5 py-1 rounded-md bg-[var(--bg-canvas)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] hover:border-[var(--accent-blue)] font-sans mr-2"
                        >
                          Pull
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete subscription ${sub.name}?`)) {
                              deletePubsubSubscription(sub.id);
                            }
                          }}
                          className="p-1 hover:text-[var(--danger)] text-[var(--text-muted)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEAD-LETTER QUEUES */}
      {activeTab === 'deadletter' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Dead-Letter Queue (DLQ) Management</span>
            </div>
            <p className="text-[11px] text-amber-300/80 leading-relaxed">
              When a subscriber repeatedly fails (NACKs) a message past the max delivery attempts threshold, LocalCloud automatically moves the payload to a designated Dead-Letter topic to prevent infinite processing loops.
            </p>
          </div>

          <div className="border border-[var(--border-color)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            {deadLetterMessages.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                  Dead-letter queue is clear
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                  No poison messages have exceeded delivery attempts. You can trigger this flow by repeatedly NACKing messages in a subscription with a configured Dead-Letter topic.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-canvas)] border-b border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-3 px-4">Message ID</th>
                    <th className="py-3 px-4">Dead-Letter Topic</th>
                    <th className="py-3 px-4">Payload Preview</th>
                    <th className="py-3 px-4">Published At</th>
                    <th className="py-3 px-4 text-right">Attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {deadLetterMessages.map(msg => (
                    <tr key={msg.id} className="hover:bg-[var(--card-hover)]">
                      <td className="py-3.5 px-4 font-bold text-amber-400">{msg.id}</td>
                      <td className="py-3.5 px-4">{msg.topicName}</td>
                      <td className="py-3.5 px-4 font-sans max-w-md truncate text-[var(--text-secondary)]">
                        {msg.data}
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-muted)]">
                        {new Date(msg.publishTime).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 text-right text-red-400 font-bold">
                        {msg.deliveryAttempts} (Failed)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CREATE TOPIC MODAL */}
      {isCreateTopicOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Radio className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Create topic</span>
              </h3>
              <button onClick={() => setIsCreateTopicOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTopic} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Topic ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. telemetry-events"
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Message retention duration (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={topicRetentionDays}
                  onChange={e => setTopicRetentionDays(parseInt(e.target.value) || 7)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateTopicOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold"
                >
                  Create topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SUBSCRIPTION MODAL */}
      {isCreateSubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Inbox className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Create subscription</span>
              </h3>
              <button onClick={() => setIsCreateSubOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSub} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Subscription ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. order-worker-sub"
                  value={newSubName}
                  onChange={e => setNewSubName(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Select a Cloud Pub/Sub topic <span className="text-red-400">*</span>
                </label>
                <select
                  value={subTopicName}
                  onChange={e => setSubTopicName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                >
                  {pubsubTopics.map(t => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Delivery type
                  </label>
                  <select
                    value={subDeliveryType}
                    onChange={e => setSubDeliveryType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    <option value="PULL">Pull</option>
                    <option value="PUSH">Push</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Ack deadline (seconds)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={subAckDeadline}
                    onChange={e => setSubAckDeadline(parseInt(e.target.value) || 10)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Dead letter policy */}
              <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dead-letter policy (recommended)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Dead-letter topic
                    </label>
                    <select
                      value={subDeadLetterTopic}
                      onChange={e => setSubDeadLetterTopic(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
                    >
                      <option value="">None (disable)</option>
                      {pubsubTopics.map(t => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Max delivery attempts (5-100)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={subMaxDeliveryAttempts}
                      onChange={e => setSubMaxDeliveryAttempts(parseInt(e.target.value) || 5)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsCreateSubOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold"
                >
                  Create subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PUBLISH MESSAGE MODAL */}
      {isPublishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <Send className="w-4 h-4 text-[var(--accent-blue)]" />
                <span>Publish message to {selectedTopic?.name || 'Topic'}</span>
              </h3>
              <button onClick={() => setIsPublishOpen(false)} className="text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublishMessage} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Message body (JSON or Plain Text) <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={6}
                  value={publishPayload}
                  onChange={e => setPublishPayload(e.target.value)}
                  className="w-full p-3 rounded-lg bg-black text-neutral-200 font-mono text-xs border border-[var(--border-color)] focus:outline-none focus:border-[var(--accent-blue)] leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Message attributes (Key-Value pairs)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Key"
                    value={attrKey}
                    onChange={e => setAttrKey(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={attrVal}
                    onChange={e => setAttrVal(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (attrKey.trim()) {
                        setCustomAttrs(prev => ({ ...prev, [attrKey.trim()]: attrVal }));
                        setAttrKey('');
                        setAttrVal('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] hover:border-[var(--accent-blue)]"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {Object.entries(customAttrs).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center gap-1.5"
                    >
                      <span>{k}={v}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...customAttrs };
                          delete updated[k];
                          setCustomAttrs(updated);
                        }}
                        className="hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">
                  Ordering key (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. order-user-42"
                  value={orderingKey}
                  onChange={e => setOrderingKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsPublishOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[var(--accent-blue)] text-black font-semibold hover:bg-[var(--accent-hover)]"
                >
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
