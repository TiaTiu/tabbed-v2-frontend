import React, { useState, useEffect } from 'react';
import { Users, Receipt, DollarSign, Plus, ChevronRight, ArrowRight, ArrowLeft, FileText, LayoutDashboard, ExternalLink, Share2, Check, X } from 'lucide-react';

const API_URL = "https://tabbed-v2-backend-production.up.railway.app";

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [settlement, setSettlement] = useState(null);

  const [newSessionName, setNewSessionName] = useState("");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [receiptTitle, setReceiptTitle] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const [activeReceiptId, setActiveReceiptId] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [copied, setCopied] = useState(false);
  const [modalImage, setModalImage] = useState(null);

  const formatIDR = (amount) => {
    if (amount == null || isNaN(amount)) return "Rp 0";
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    const viewParam = params.get('view');
    
    if (sessionParam) {
      setCurrentSessionId(parseInt(sessionParam, 10));
      if (viewParam) setCurrentView(viewParam);
    }
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
      
      const newUrl = `${window.location.pathname}?session=${currentSessionId}&view=${currentView}`;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }
  }, [currentSessionId, currentView]);

  const fetchSessionDetails = async (id) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`);
      const data = await res.json();
      setSessionData(data);
    } catch (err) {
      console.error("Error fetching session details:", err);
    }
  };

  const fetchSettlement = async (id) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}/settlement`);
      const data = await res.json();
      setSettlement(data);
    } catch (err) {
      console.error("Error fetching settlement:", err);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/sessions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSessionName })
      });
      const data = await res.json();
      setSessions([...sessions, data]);
      setCurrentSessionId(data.id);
      setNewSessionName("");
      setActiveReceiptId(null);
      setCurrentView('dashboard');
    } catch (err) {
      console.error("Error creating session:", err);
    }
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (!newParticipantName.trim() || !currentSessionId) return;
    try {
      await fetch(`${API_URL}/participants/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newParticipantName, session_id: currentSessionId })
      });
      setNewParticipantName("");
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
    } catch (err) {
      console.error("Error adding participant:", err);
    }
  };

  const handleAddReceipt = async (e) => {
    e.preventDefault();
    if (!receiptTitle.trim() || !receiptAmount || !currentSessionId) return;
    try {
      await fetch(`${API_URL}/receipts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: receiptTitle, 
          total_amount: parseFloat(receiptAmount), 
          session_id: currentSessionId 
        })
      });
      setReceiptTitle("");
      setReceiptAmount("");
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
    } catch (err) {
      console.error("Error adding receipt:", err);
    }
  };

  const handleGeminiBulkUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentSessionId) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch(`${API_URL}/sessions/${currentSessionId}/receipts/gemini-bulk-upload`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to process receipts on the server.");
      }
      
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
    } catch (err) {
      console.error("Error uploading receipts with Gemini:", err);
      alert("Upload error: " + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null;
    }
  };

  const handleToggleParticipant = async (item, participantId) => {
    const currentIds = item.participants?.map(p => p.id) || [];
    let newIds = currentIds.includes(participantId)
      ? currentIds.filter(id => id !== participantId)
      : [...currentIds, participantId];

    try {
      await fetch(`${API_URL}/items/${item.id}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_ids: newIds })
      });
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
    } catch (err) {
      console.error("Error updating item assignments:", err);
    }
  };

  const handleUpdatePayerAmount = async (receipt, participantId, amount) => {
    const existingPayers = receipt.payers || [];
    let updatedPayers = existingPayers.map(p => ({
      participant_id: p.participant_id,
      amount_paid: p.participant_id === participantId ? parseFloat(amount) || 0 : p.amount_paid
    }));

    if (!updatedPayers.some(p => p.participant_id === participantId) && amount > 0) {
      updatedPayers.push({ participant_id: participantId, amount_paid: parseFloat(amount) });
    }

    updatedPayers = updatedPayers.filter(p => p.amount_paid > 0);

    try {
      await fetch(`${API_URL}/receipts/${receipt.id}/payers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payers: updatedPayers })
      });
      fetchSessionDetails(currentSessionId);
      fetchSettlement(currentSessionId);
    } catch (err) {
      console.error("Error updating payer amount:", err);
    }
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/?session=${currentSessionId}&view=summary`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeReceipt = sessionData?.receipts?.find(r => r.id === activeReceiptId);

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans selection:bg-black selection:text-white">
      {/* IMAGE PREVIEW MODAL */}
      {modalImage && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">Receipt Preview</h3>
              <button
                onClick={() => setModalImage(null)}
                className="bg-neutral-100 hover:bg-neutral-200 p-2 rounded-full text-neutral-700 transition-colors"
              >
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[80vh] bg-neutral-50 flex justify-center">
              <img src={modalImage} alt="Receipt Preview Full" className="w-full max-w-lg h-auto object-contain rounded-xl border border-neutral-200 shadow-sm bg-white" />
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-neutral-200 bg-white/85 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start space-x-3">
          <div className="flex items-center space-x-3">
            <div className="bg-black text-white p-2 rounded-lg shadow-sm">
              <Receipt className="w-5 h-5"/>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900 cursor-pointer" onClick={() => {setCurrentSessionId(null); setCurrentView('dashboard');}}>Tabbed V2</h1>
          </div>
          
          {sessionData && (
            <button 
              onClick={handleShareLink}
              className="sm:hidden flex items-center gap-1.5 bg-black text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5"/> : <Share2 className="w-3.5 h-3.5"/>}
              {copied ? "Copied" : "Share"}
            </button>
          )}
        </div>

        {currentSessionId && (
          <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 w-full sm:w-auto justify-center">
            <button
              onClick={() => { setCurrentView('dashboard'); setActiveReceiptId(null); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'dashboard' && !activeReceiptId ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5"/> Dashboard
            </button>
            <button
              onClick={() => { setCurrentView('summary'); setActiveReceiptId(null); }}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'summary' ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <FileText className="w-3.5 h-3.5"/> Summary
            </button>
          </div>
        )}

        {sessionData && (
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-xs font-medium text-neutral-600 bg-neutral-100 px-3.5 py-1.5 rounded-full border border-neutral-200">
              Session: <span className="text-black font-semibold">{sessionData?.name}</span>
            </div>
            
            <button 
              onClick={handleShareLink}
              className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-4 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm"
            >
              {copied ? <Check className="w-3.5 h-3.5"/> : <Share2 className="w-3.5 h-3.5"/>}
              {copied ? "Copied Link!" : "Share"}
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: CONTEXTUAL SIDEBAR */}
        <div className="space-y-6">
          {activeReceipt ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs sticky top-24 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-black"/> Original Receipt
                </span>
                {activeReceipt.image_url && (
                  <button
                    onClick={() => setModalImage(activeReceipt.image_url)}
                    className="text-xs font-medium text-black hover:underline flex items-center gap-1 bg-neutral-100 px-2.5 py-1 rounded-md border border-neutral-200"
                  >
                    Open <ExternalLink className="w-3 h-3"/>
                  </button>
                )}
              </div>

              {activeReceipt.image_url ? (
                <div 
                  onClick={() => setModalImage(activeReceipt.image_url)}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 max-h-[65vh] overflow-y-auto cursor-pointer group relative"
                >
                  <img
                    src={activeReceipt.image_url}
                    alt={activeReceipt.title}
                    className="w-full h-auto object-contain group-hover:opacity-95 transition-opacity"
                  />
                </div>
              ) : (
                <div className="bg-neutral-50 border border-neutral-200 border-dashed rounded-xl p-8 text-center text-xs text-neutral-400">
                  No image photo available for this receipt
                </div>
              )}
            </div>
          ) : currentView === 'summary' && currentSessionId ? (
            <div className="space-y-4 sticky top-24">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-black"/> Session Photos
              </h2>
              <div className="max-h-[75vh] overflow-y-auto pr-2 space-y-5 pb-8">
                {sessionData?.receipts?.filter(r => r.image_url).length > 0 ? (
                  sessionData.receipts.map(r => r.image_url && (
                    <div key={r.id} className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-3">
                        <span className="text-xs font-bold text-black">{r.title}</span>
                        <button
                          onClick={() => setModalImage(r.image_url)}
                          className="text-xs font-medium text-black hover:underline flex items-center gap-1 bg-neutral-100 px-2 py-1 rounded-md border border-neutral-200"
                        >
                          Open <ExternalLink className="w-3 h-3"/>
                        </button>
                      </div>
                      <div 
                        onClick={() => setModalImage(r.image_url)}
                        className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 cursor-pointer group"
                      >
                        <img
                          src={r.image_url}
                          alt={r.title}
                          className="w-full h-auto object-contain group-hover:opacity-95 transition-opacity"
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-neutral-50 border border-neutral-200 border-dashed rounded-xl p-8 text-center text-xs text-neutral-400">
                    No receipt photos available for this session.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-black"/> New Session
                </h2>
                <form onSubmit={handleCreateSession} className="space-y-3">
                  <input
                    type="text"
                    placeholder="e.g., Weekend Trip, Dinner"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black transition-colors"
                  />
                  <button
                    type="submit"
                    className="w-full bg-black hover:bg-neutral-800 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm text-sm"
                  >
                    Create Session
                  </button>
                </form>
              </div>

              {sessions.length > 0 && (
                <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Sessions</h3>
                  <div className="space-y-1.5">
                    {sessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setCurrentSessionId(s.id);
                          setActiveReceiptId(null);
                          setCurrentView('dashboard');
                        }}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-between ${
                          currentSessionId === s.id 
                            ? 'bg-neutral-900 text-white shadow-xs' 
                            : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-100'
                        }`}
                      >
                        <span>{s.name}</span>
                        <ChevronRight className={`w-4 h-4 ${currentSessionId === s.id ? 'text-white' : 'text-neutral-400'}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT COLUMN: MAIN CONTENT VIEWS */}
        <div className="md:col-span-2 space-y-6">
          {!currentSessionId ? (
            <div className="bg-neutral-50 border border-neutral-200 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 text-black mb-4 shadow-xs">
                <Receipt className="w-6 h-6"/>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">No Session Selected</h3>
              <p className="text-sm text-neutral-500 max-w-sm">Create a new session on the left or select an existing one to start tracking splits and balances.</p>
            </div>
          ) : currentView === 'summary' ? (
            <div className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <h2 className="text-2xl font-bold text-black tracking-tight mb-2">Receipts & Itemized Breakdown</h2>
                <p className="text-sm text-neutral-500 mb-6">Complete overview of all receipts, item allocations, and amounts paid in {sessionData?.name}.</p>

                <div className="space-y-6">
                  {sessionData?.receipts?.map((r) => (
                    <div key={r.id} className="bg-neutral-50 border border-neutral-200 p-4 sm:p-6 rounded-2xl space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
                        <div>
                          <h3 className="font-bold text-lg text-black">{r.title}</h3>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Paid by: {r.payers?.length > 0 ? r.payers.map(p => `${p.participant?.name || 'Someone'} (${formatIDR(p.amount_paid)})`).join(', ') : <span className="text-amber-600 font-medium">Not specified</span>}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">Total Amount</span>
                          <span className="font-bold text-lg text-black">{formatIDR(r.total_amount)}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Itemized Items</p>
                        {r.items?.map((item) => (
                          <div key={item.id} className="bg-white border border-neutral-200/60 p-3 rounded-xl flex items-center justify-between text-sm">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-neutral-900">{item.name}</span>
                                {item.quantity > 1 && (
                                  <span className="bg-neutral-100 text-neutral-600 text-xs px-2 py-0.5 rounded-md font-semibold">
                                    {item.quantity}x
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.participants?.length > 0 ? (
                                  item.participants.map(p => (
                                    <span key={p.id} className="bg-neutral-100 text-neutral-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                      {p.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-neutral-400 italic">Unassigned</span>
                                )}
                              </div>
                            </div>
                            <span className="font-semibold text-neutral-900">{formatIDR(item.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-black"/> Recommended Settlement Transfers
                </h3>
                <div className="space-y-2">
                  {settlement?.settlements && settlement.settlements.length > 0 ? (
                    settlement.settlements.map((s, index) => (
                      <div key={index} className="bg-neutral-50 border border-neutral-200/60 px-4 py-3 rounded-xl text-sm flex items-center justify-between text-neutral-800">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="text-black font-semibold">{s.from}</span>
                          <ArrowRight className="w-4 h-4 text-neutral-400"/>
                          <span className="text-black font-semibold">{s.to}</span>
                        </div>
                        <span className="font-semibold text-black bg-white px-3 py-1 rounded-lg border border-neutral-200 shadow-2xs">
                          {formatIDR(s.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-400 italic">No transfers required or specify payment amounts for receipts.</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeReceipt ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
              <button
                onClick={() => setActiveReceiptId(null)}
                className="flex items-center text-sm font-medium text-neutral-500 hover:text-black transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4 mr-2"/> Back to Dashboard
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-6 border-b border-neutral-100 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-black tracking-tight">{activeReceipt.title}</h2>
                  <p className="text-sm text-neutral-500 mt-1">Assign items to one or multiple participants</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Total Receipt</p>
                  <p className="text-2xl font-semibold text-black tracking-tight">{formatIDR(activeReceipt.total_amount)}</p>
                </div>
              </div>

              <div className="space-y-4">
                {activeReceipt.items?.map((item) => (
                  <div key={item.id} className="bg-neutral-50 border border-neutral-200/60 p-4 rounded-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex-1 flex items-center gap-2">
                        <p className="font-semibold text-neutral-900">{item.name}</p>
                        {item.quantity > 1 && (
                          <span className="bg-neutral-200 text-neutral-800 text-xs px-2 py-0.5 rounded-md font-bold">
                            {item.quantity}x
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-neutral-700">{formatIDR(item.price)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sessionData?.participants?.map((p) => {
                        const isSelected = item.participants?.some(ip => ip.id === p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => handleToggleParticipant(item, p.id)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                              isSelected 
                                ? 'bg-black text-white border-black shadow-sm' 
                                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="bg-neutral-100 text-black p-3 rounded-xl border border-neutral-200 w-fit">
                    <DollarSign className="w-5 h-5"/>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Total Spend</p>
                    <p className="text-xl sm:text-2xl font-semibold text-black tracking-tight">
                      {formatIDR(settlement?.total_session_spend)}
                    </p>
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="bg-neutral-100 text-black p-3 rounded-xl border border-neutral-200 w-fit">
                    <Users className="w-5 h-5"/>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Share / Person</p>
                    <p className="text-xl sm:text-2xl font-semibold text-black tracking-tight">
                      {formatIDR(settlement?.share_per_person)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-black"/> Participants
                    </h3>
                    <form onSubmit={handleAddParticipant} className="flex gap-2 mb-4">
                      <input
                        type="text"
                        placeholder="Name"
                        value={newParticipantName}
                        onChange={(e) => setNewParticipantName(e.target.value)}
                        className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black"
                      />
                      <button type="submit" className="bg-neutral-900 hover:bg-black text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        Add
                      </button>
                    </form>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {sessionData?.participants?.map((p) => (
                        <div key={p.id} className="bg-neutral-50 border border-neutral-200/60 px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between text-neutral-800">
                          <span>{p.name}</span>
                        </div>
                      ))}
                      {(!sessionData?.participants || sessionData?.participants.length === 0) && (
                        <p className="text-xs text-neutral-400 italic">No participants added yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-black"/> Receipts
                    </h3>
                    
                    <div className="mb-4">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                        {isUploading ? "Uploading & Scanning..." : "Upload Receipts (Gemini AI)"}
                      </label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleGeminiBulkUpload}
                        disabled={isUploading}
                        className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white hover:file:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                      />
                    </div>

                    <form onSubmit={handleAddReceipt} className="space-y-3 pt-4 border-t border-neutral-100">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Manual Entry</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Title"
                          value={receiptTitle}
                          onChange={(e) => setReceiptTitle(e.target.value)}
                          className="w-full sm:w-1/2 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                        <input
                          type="number"
                          step="1"
                          placeholder="Amount (Rp)"
                          value={receiptAmount}
                          onChange={(e) => setReceiptAmount(e.target.value)}
                          className="w-full sm:w-1/2 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black"
                        />
                      </div>
                      <button type="submit" className="w-full bg-neutral-100 hover:bg-neutral-200 text-black py-2 rounded-xl text-sm font-medium transition-colors border border-neutral-200">
                        Add Receipt Manually
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                 <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-black"/> Scanned Receipts
                </h3>
                <div className="space-y-4">
                  {sessionData?.receipts?.map((r) => (
                    <div key={r.id} className="bg-neutral-50 border border-neutral-200/60 p-4 rounded-xl space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-neutral-800 gap-3">
                        <div className="flex items-center gap-3">
                          {r.image_url && (
                            <button onClick={() => setModalImage(r.image_url)} className="focus:outline-none shrink-0">
                              <img src={r.image_url} alt={r.title} className="w-12 h-12 object-cover rounded-lg border border-neutral-300 hover:opacity-80 transition-opacity" title="Click to view full image" />
                            </button>
                          )}
                          <div>
                            <div className="font-semibold text-black mb-0.5">{r.title}</div>
                            <div className="text-xs text-neutral-500">{r.items?.length || 0} items extracted</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                          <span className="font-semibold text-black">{formatIDR(r.total_amount)}</span>
                          <button
                            onClick={() => setActiveReceiptId(r.id)}
                            className="bg-black hover:bg-neutral-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                          >
                            Assign
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-neutral-200/60">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Who Paid?</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {sessionData?.participants?.map((p) => {
                            const existingPayer = r.payers?.find(pr => pr.participant_id === p.id);
                            const paidAmount = existingPayer ? existingPayer.amount_paid : "";
                            return (
                              <div key={p.id} className="flex items-center justify-between bg-white border border-neutral-200 px-3 py-1.5 rounded-lg">
                                <span className="text-xs font-medium text-neutral-700">{p.name}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-neutral-400">Rp</span>
                                  <input
                                    type="number"
                                    step="1"
                                    placeholder="0"
                                    value={paidAmount}
                                    onChange={(e) => handleUpdatePayerAmount(r, p.id, e.target.value)}
                                    className="w-24 text-right bg-neutral-50 border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-900 focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!sessionData?.receipts || sessionData?.receipts.length === 0) && (
                    <p className="text-xs text-neutral-400 italic text-center py-4">No receipts recorded yet.</p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-black"/> Recommended Settlement Transfers
                </h3>
                <div className="space-y-2">
                  {settlement?.settlements && settlement.settlements.length > 0 ? (
                    settlement.settlements.map((s, index) => (
                      <div key={index} className="bg-neutral-50 border border-neutral-200/60 px-4 py-3 rounded-xl text-sm flex items-center justify-between text-neutral-800">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="text-black font-semibold">{s.from}</span>
                          <ArrowRight className="w-4 h-4 text-neutral-400"/>
                          <span className="text-black font-semibold">{s.to}</span>
                        </div>
                        <span className="font-semibold text-black bg-white px-3 py-1 rounded-lg border border-neutral-200 shadow-2xs">
                          {formatIDR(s.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-400 italic">No transfers required or specify payment amounts for receipts.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}