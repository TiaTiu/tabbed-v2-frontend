import React, { useState, useEffect, useRef } from 'react';
import { Users, Receipt, DollarSign, Plus, ChevronRight, ArrowRight, ArrowLeft, FileText, LayoutDashboard, ExternalLink, Share2, Check, X, Trash2, AlertCircle, Copy, Scissors } from 'lucide-react';
import { toBlob } from 'html-to-image';

const API_URL = "https://tabbed-v2-backend-production.up.railway.app";

const getOrCreateUserToken = () => {
  let token = localStorage.getItem('tabbed_user_token');
  if (!token) {
    token = 'user_' + Math.random().toString(36).substring(2) + Date.now();
    localStorage.setItem('tabbed_user_token', token);
  }
  return token;
};

export default function App() {
  const [userToken] = useState(getOrCreateUserToken());
  
  const [events, setEvents] = useState([]);
  const [currentEventId, setCurrentEventId] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);

  const assignmentsRef = useRef({});
  const debounceTimers = useRef({});
  const abortControllers = useRef({});

  const [newEventName, setNewEventName] = useState("");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [splittingItemId, setSplittingItemId] = useState(null);
  
  const [activeReceiptId, setActiveReceiptId] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSharedView, setIsSharedView] = useState(false);

  const [copied, setCopied] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  const [showDesktopShareModal, setShowDesktopShareModal] = useState(false);
  const [desktopShareImage, setDesktopShareImage] = useState(null);
  const [desktopShareText, setDesktopShareText] = useState("");

  const formatIDR = (amount) => {
    if (amount == null || isNaN(amount)) return "Rp 0";
    const rounded = Math.round(amount);
    if (rounded < 0) {
      return `-Rp ${new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 0,
      }).format(Math.abs(rounded))}`;
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(rounded);
  };

  const formatNumberOnly = (amount) => {
    if (amount == null || isNaN(amount)) return "0";
    const rounded = Math.round(amount);
    const formatted = new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0,
    }).format(Math.abs(rounded));
    return rounded < 0 ? `-${formatted}` : formatted;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventParam = params.get('event');
    const viewParam = params.get('view');
    const sharedParam = params.get('shared');
    
    if (sharedParam === 'true') {
      setIsSharedView(true);
      setCurrentView('summary');
    } else if (viewParam) {
      setCurrentView(viewParam);
    }

    if (eventParam) {
      setCurrentEventId(parseInt(eventParam, 10));
    }
    
    if (sharedParam !== 'true') {
      fetch(`${API_URL}/events/?owner_token=${userToken}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setEvents(data);
        })
        .catch(console.error);
    }
  }, [userToken]);

  useEffect(() => {
    if (currentEventId) {
      setIsLoadingEvent(true);
      Promise.all([
        fetchEventDetails(currentEventId),
        fetchSettlement(currentEventId)
      ]).finally(() => {
        setIsLoadingEvent(false);
      });
    } else {
      setEventData(null);
      setSettlement(null);
    }
  }, [currentEventId]);

  useEffect(() => {
    if (currentEventId) {
      const newUrl = `${window.location.pathname}?event=${currentEventId}&view=${currentView}${isSharedView ? '&shared=true' : ''}`;
      window.history.pushState({ path: newUrl }, '', newUrl);
    } else {
      window.history.pushState({ path: '/' }, '', '/');
    }
  }, [currentEventId, currentView, isSharedView]);

  const fetchEventDetails = async (id) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}`);
      const data = await res.json();
      setEventData(data);

      if (data?.receipts) {
        const map = {};
        data.receipts.forEach(r => {
          r.items?.forEach(i => {
            map[i.id] = i.participants?.map(p => p.id) || [];
          });
        });
        assignmentsRef.current = map;
      }
    } catch (err) {
      console.error("Error fetching event details:", err);
    }
  };

  const fetchSettlement = async (id) => {
    try {
      const res = await fetch(`${API_URL}/events/${id}/settlement`);
      const data = await res.json();
      setSettlement(data);
    } catch (err) {
      console.error("Error fetching settlement:", err);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/events/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newEventName, owner_token: userToken })
      });
      const data = await res.json();
      setEvents(prev => Array.isArray(prev) ? [...prev, data] : [data]);
      setCurrentEventId(data.id);
      setNewEventName("");
      setActiveReceiptId(null);
      setCurrentView('dashboard');
    } catch (err) {
      console.error("Error creating event:", err);
    }
  };

  const handleDeleteEvent = async (e, eventId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this event and all its data?")) return;

    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Server failed to delete event");

      setEvents(prev => prev.filter(ev => ev.id !== eventId));
      if (currentEventId === eventId) {
        setCurrentEventId(null);
        setEventData(null);
        setCurrentView('dashboard');
      }
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Failed to delete event. Please try again.");
    }
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (!newParticipantName.trim() || !currentEventId) return;
    const nameToAdd = newParticipantName;
    setNewParticipantName("");

    const tempId = Date.now();
    const tempParticipant = { id: tempId, name: nameToAdd };
    
    setEventData(prev => ({
      ...prev,
      participants: [...(prev?.participants || []), tempParticipant]
    }));

    try {
      const res = await fetch(`${API_URL}/participants/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameToAdd, event_id: currentEventId })
      });
      const newDbParticipant = await res.json();

      setEventData(prev => ({
        ...prev,
        participants: prev.participants.map(p => p.id === tempId ? newDbParticipant : p)
      }));
      
      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error adding participant:", err);
      fetchEventDetails(currentEventId); 
    }
  };

  const handleDeleteParticipant = async (participantId) => {
    if (!window.confirm("Are you sure you want to delete this participant?")) return;

    try {
      const res = await fetch(`${API_URL}/participants/${participantId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Server failed to delete participant");

      setEventData(prev => ({
        ...prev,
        participants: (prev?.participants || []).filter(p => p.id !== participantId),
        receipts: (prev?.receipts || []).map(r => ({
          ...r,
          payers: (r.payers || []).filter(pr => pr.participant_id !== participantId)
        }))
      }));
      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error deleting participant:", err);
      alert("Failed to delete participant. Please try again.");
      fetchEventDetails(currentEventId);
    }
  };

  const handleDeleteReceipt = async (receiptId) => {
    if (!window.confirm("Are you sure you want to delete this receipt?")) return;

    try {
      const res = await fetch(`${API_URL}/receipts/${receiptId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Server failed to delete receipt");

      setEventData(prev => ({
        ...prev,
        receipts: (prev?.receipts || []).filter(r => r.id !== receiptId)
      }));

      if (activeReceiptId === receiptId) setActiveReceiptId(null);
      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error deleting receipt:", err);
      alert("Failed to delete receipt. Please try again.");
      fetchEventDetails(currentEventId);
    }
  };

  const handleGeminiBulkUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentEventId) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch(`${API_URL}/events/${currentEventId}/receipts/gemini-bulk-upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Server error during upload.");
      }

      await fetchEventDetails(currentEventId);
      await fetchSettlement(currentEventId);
      
    } catch (err) {
      console.error("Error uploading receipts with Gemini:", err);
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
      e.target.value = null;
    }
  };

  const handleSplitItem = async (itemId) => {
    if (!window.confirm("Split this grouped item into individual portions?")) return;

    const activeReceipt = eventData?.receipts?.find(r => r.items?.some(i => i.id === itemId));
    if (!activeReceipt) return;

    setSplittingItemId(itemId); // Show loading state

    try {
      // 1. Tell backend to split the item (Creates REAL database IDs)
      const res = await fetch(`${API_URL}/items/${itemId}/split`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Server failed to split item");
      }

      // 2. Fetch the fresh database state quietly
      const eventRes = await fetch(`${API_URL}/events/${currentEventId}`);
      const eventDataFresh = await eventRes.json();

      // 3. Carefully merge the new real items into the exact array index position
      setEventData(prev => {
        if (!prev) return prev;
        const freshReceipt = eventDataFresh.receipts.find(r => r.id === activeReceipt.id);
        if (!freshReceipt) return eventDataFresh;

        const oldItemIds = new Set(activeReceipt.items.map(i => i.id));
        oldItemIds.delete(itemId); // The split item is gone

        // Find the brand new items that just arrived from the database
        const newItemsFromDb = freshReceipt.items.filter(i => !oldItemIds.has(i.id));
        const retainedItems = freshReceipt.items.filter(i => oldItemIds.has(i.id));

        // Sync local assignment tracker so instant-clicks work on new real IDs
        newItemsFromDb.forEach(newItem => {
          assignmentsRef.current[newItem.id] = newItem.participants?.map(p => p.id) || [];
        });

        // Rebuild the items array in the exact same order
        const updatedItems = [];
        activeReceipt.items.forEach(oldItem => {
           if (oldItem.id === itemId) {
              updatedItems.push(...newItemsFromDb);
           } else {
              const freshVersion = retainedItems.find(i => i.id === oldItem.id) || oldItem;
              updatedItems.push(freshVersion);
           }
        });

        const updatedReceipts = eventDataFresh.receipts.map(r => {
           if (r.id === activeReceipt.id) {
               return { ...freshReceipt, items: updatedItems };
           }
           return r;
        });

        return { ...eventDataFresh, receipts: updatedReceipts };
      });

      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error splitting item:", err);
      alert(`Failed to split item: ${err.message}`);
    } finally {
      setSplittingItemId(null);
    }
  };

  const handleToggleParticipant = (item, participantId) => {
    const currentIds = assignmentsRef.current[item.id] !== undefined
      ? assignmentsRef.current[item.id]
      : (item.participants?.map(p => p.id) || []);

    const isSelected = currentIds.includes(participantId);
    const newIds = isSelected
      ? currentIds.filter(id => id !== participantId)
      : [...currentIds, participantId];

    assignmentsRef.current[item.id] = newIds;

    setEventData(prev => {
      if (!prev) return prev;
      const updatedReceipts = prev.receipts.map(r => ({
        ...r,
        items: r.items.map(i => {
          if (i.id === item.id) {
            const newParticipantObjs = newIds.map(id => 
              prev.participants.find(p => p.id === id) || { id }
            );
            return { ...i, participants: newParticipantObjs };
          }
          return i;
        })
      }));
      return { ...prev, receipts: updatedReceipts };
    });

    if (abortControllers.current[item.id]) {
      abortControllers.current[item.id].abort();
    }
    const controller = new AbortController();
    abortControllers.current[item.id] = controller;

    if (debounceTimers.current[item.id]) {
      clearTimeout(debounceTimers.current[item.id]);
    }

    debounceTimers.current[item.id] = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/items/${item.id}/assign`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_ids: assignmentsRef.current[item.id] }),
          signal: controller.signal
        });
        fetchSettlement(currentEventId);
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log(`Intercepted and killed a lagging network request for item ${item.id}.`);
        } else {
          console.error("Error updating item assignments:", err);
          fetchEventDetails(currentEventId);
        }
      }
    }, 500); 
  };

  const calculateReceiptTotals = (receipt) => {
    if (!receipt) return { subtotal: 0, others: 0, total: 0, isInclusive: false };

    const items = receipt.items || [];
    const subtotal = items.reduce((acc, curr) => acc + (parseFloat(curr.price) || 0), 0);
    const t = parseFloat(receipt.tax) || 0;
    const s = parseFloat(receipt.service) || 0;
    const d = Math.abs(parseFloat(receipt.discount) || 0);
    const o = parseFloat(receipt.others) || 0;

    const inclusiveTotal = subtotal + s + o - d;
    const exclusiveTotal = subtotal + t + s + o - d;

    const targetTotal = parseFloat(receipt.total_amount) || inclusiveTotal;

    const diffInclusive = Math.abs(targetTotal - inclusiveTotal);
    const diffExclusive = Math.abs(targetTotal - exclusiveTotal);
    const isInclusive = diffInclusive < diffExclusive;

    const liveTotal = isInclusive ? inclusiveTotal : exclusiveTotal;

    return { subtotal, others: o, total: liveTotal, isInclusive };
  };

  const handleUpdateItemPriceLocally = (itemId, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');
    setEventData(prevData => {
      if (!prevData) return prevData;
      const updatedReceipts = prevData.receipts.map(r => {
        if (r.id === activeReceiptId) {
          const updatedItems = r.items.map(item => item.id === itemId ? { ...item, price: cleanedValue === "" ? "" : parseFloat(cleanedValue) } : item);
          return { ...r, items: updatedItems }; 
        }
        return r;
      });
      return { ...prevData, receipts: updatedReceipts };
    });
  };

  const handleBlurItemPrice = async (itemId, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');
    const newPrice = cleanedValue === "" ? 0 : parseFloat(cleanedValue);

    try {
      await fetch(`${API_URL}/items/${itemId}/price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: newPrice })
      });

      const activeReceipt = eventData.receipts.find(r => r.id === activeReceiptId);
      const simulatedItems = activeReceipt.items.map(i => i.id === itemId ? { ...i, price: newPrice } : i);
      const simulatedReceipt = { ...activeReceipt, items: simulatedItems };
      const newTotals = calculateReceiptTotals(simulatedReceipt);

      await fetch(`${API_URL}/receipts/${activeReceiptId}/subtotal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtotal: newTotals.subtotal })
      });
      await fetch(`${API_URL}/receipts/${activeReceiptId}/total_amount`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_amount: newTotals.total })
      });

      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error updating item price:", err);
    }
  };

  const handleUpdateReceiptFeeLocally = (field, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');
    setEventData(prevData => {
      if (!prevData) return prevData;
      const updatedReceipts = prevData.receipts.map(r => {
        if (r.id === activeReceiptId) {
          return { ...r, [field]: cleanedValue === "" ? "" : parseFloat(cleanedValue) }; 
        }
        return r;
      });
      return { ...prevData, receipts: updatedReceipts };
    });
  };

  const handleBlurReceiptFee = async (field, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');
    let newVal = cleanedValue === "" ? 0 : parseFloat(cleanedValue);

    if (field === 'discount' && newVal > 0) {
      newVal = -newVal;
    }

    try {
      await fetch(`${API_URL}/receipts/${activeReceiptId}/${field}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newVal })
      });

      const activeReceipt = eventData.receipts.find(r => r.id === activeReceiptId);
      const simulatedReceipt = { ...activeReceipt, [field]: newVal };
      const newTotals = calculateReceiptTotals(simulatedReceipt);

      await fetch(`${API_URL}/receipts/${activeReceiptId}/total_amount`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_amount: newTotals.total })
      });

      fetchSettlement(currentEventId);
    } catch (err) {
      console.error(`Error updating receipt ${field}:`, err);
    }
  };

  const handleUpdatePayerAmount = (receipt, participantId, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');

    setEventData(prevData => {
      if (!prevData) return prevData;
      const updatedReceipts = prevData.receipts.map(r => {
        if (r.id === receipt.id) {
          const existingPayers = r.payers || [];
          let updatedPayers = existingPayers.map(p => ({
            ...p,
            amount_paid: p.participant_id === participantId ? cleanedValue : p.amount_paid
          }));

          if (!updatedPayers.some(p => p.participant_id === participantId) && cleanedValue !== "") {
            updatedPayers.push({ participant_id: participantId, amount_paid: cleanedValue });
          }

          return { ...r, payers: updatedPayers };
        }
        return r;
      });
      return { ...prevData, receipts: updatedReceipts };
    });
  };

  const handleBlurPayerAmount = async (receipt, participantId, rawValue) => {
    const cleanedValue = rawValue.replace(/[^0-9]/g, '');
    const newAmount = cleanedValue === "" ? 0 : parseFloat(cleanedValue) || 0;

    try {
      const targetReceipt = eventData?.receipts?.find(r => r.id === receipt.id);
      const existingPayers = targetReceipt?.payers || [];
      
      let updatedPayers = existingPayers.map(p => ({
        participant_id: p.participant_id,
        amount_paid: p.participant_id === participantId ? newAmount : p.amount_paid
      }));

      if (!updatedPayers.some(p => p.participant_id === participantId) && newAmount > 0) {
        updatedPayers.push({ participant_id: participantId, amount_paid: newAmount });
      }

      updatedPayers = updatedPayers.filter(p => p.amount_paid > 0);

      await fetch(`${API_URL}/receipts/${receipt.id}/payers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payers: updatedPayers })
      });
      
      fetchSettlement(currentEventId);
    } catch (err) {
      console.error("Error updating payer amount:", err);
    }
  };

  const showCopiedToast = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showCopiedToast();
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/?event=${currentEventId}&view=summary&shared=true`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(showCopiedToast).catch(() => fallbackCopyTextToClipboard(url));
    } else {
      fallbackCopyTextToClipboard(url);
    }
  };

  const handleOpenShareModal = async () => {
    if (isSharing) return;
    setIsSharing(true);

    const summaryElement = document.getElementById('share-image-wrapper');
    const url = `${window.location.origin}/?event=${currentEventId}&view=summary&shared=true`;
    const baseText = `Hi! Here is the bill splitting summary for ${eventData?.name || 'our event'}. You can check the complete details here:\n\n${url}`;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!summaryElement) {
      handleShareLink();
      setIsSharing(false);
      return;
    }

    try {
      const blob = await toBlob(summaryElement, { 
        cacheBust: true, 
        backgroundColor: '#ffffff',
        style: { background: '#ffffff' },
        pixelRatio: 3 
      });

      if (!blob) throw new Error("Failed to generate image blob");

      const file = new File([blob], 'bill-summary.png', { type: 'image/png' });
      const shareData = {
        title: eventData?.name ? `Bill Summary - ${eventData.name}` : 'Bill Summary',
        text: baseText,
        files: [file]
      };

      if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else if (isMobile && navigator.share) {
        await navigator.share({ title: shareData.title, text: baseText });
      } else {
        const objectUrl = URL.createObjectURL(blob);
        setDesktopShareImage(objectUrl);
        setDesktopShareText(baseText);
        setShowDesktopShareModal(true);
      }
    } catch (err) {
      console.error("Image generation/share error:", err);
      handleShareLink();
    } finally {
      setIsSharing(false); 
    }
  };

  const isReadyForSummary = (() => {
    if (!eventData?.receipts || eventData.receipts.length === 0) return false;
    let ready = true;
    for (const r of eventData.receipts) {
      if (r.items && r.items.length > 0) {
        const unassigned = r.items.some(i => !i.participants || i.participants.length === 0);
        if (unassigned) { ready = false; break; }
      }
      const totalPaid = r.payers?.reduce((sum, p) => sum + (parseFloat(p.amount_paid) || 0), 0) || 0;
      if (totalPaid < (calculateReceiptTotals(r).total - 0.1)) { ready = false; break; }
    }
    return ready;
  })();

  const activeReceipt = eventData?.receipts?.find(r => r.id === activeReceiptId);
  const activeTotals = activeReceipt ? calculateReceiptTotals(activeReceipt) : null;

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans selection:bg-black selection:text-white relative">
      
      {copied && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-5 py-3 rounded-full shadow-2xl z-50 flex items-center gap-2 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <Check className="w-4 h-4 text-green-400"/>
          <span className="text-sm font-semibold">Copied to clipboard successfully!</span>
        </div>
      )}

      {showDesktopShareModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900">Share Summary</h3>
              <button
                onClick={() => setShowDesktopShareModal(false)}
                className="bg-neutral-100 hover:bg-neutral-200 p-2 rounded-full text-neutral-700 transition-colors"
              >
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-6 bg-neutral-50 flex flex-col gap-4">
              <p className="text-sm text-neutral-500 font-medium">Ready to share! Choose whether you'd like to copy the message text or copy the summary image.</p>
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                 <div className="w-full sm:w-28 h-40 shrink-0 rounded-xl border border-neutral-200 overflow-hidden bg-neutral-100 relative shadow-sm">
                   <img src={desktopShareImage} className="w-full h-auto object-cover object-top absolute top-0" alt="Preview snippet" />
                 </div>
                 <div className="text-sm text-neutral-700 whitespace-pre-wrap flex-1 bg-green-50/30 p-3 rounded-xl border border-green-100 font-medium">
                   {desktopShareText}
                 </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-white border-t border-neutral-200 flex flex-col sm:flex-row gap-3">
               <button onClick={async () => {
                 try {
                   const response = await fetch(desktopShareImage);
                   const blob = await response.blob();
                   await navigator.clipboard.write([
                      new window.ClipboardItem({ 'image/png': blob })
                   ]);
                   showCopiedToast();
                 } catch (err) {
                   alert("Direct image copying failed. Please right-click the image preview to copy.");
                 }
               }} className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-black border border-neutral-200 font-semibold py-3 rounded-xl transition-all text-sm flex justify-center items-center gap-2">
                 <Copy className="w-4 h-4"/> Copy Image
               </button>
               <button onClick={() => {
                 if (navigator.clipboard && window.isSecureContext) {
                   navigator.clipboard.writeText(desktopShareText).then(showCopiedToast).catch(() => fallbackCopyTextToClipboard(desktopShareText));
                 } else {
                   fallbackCopyTextToClipboard(desktopShareText);
                 }
               }} className="flex-1 bg-black hover:bg-neutral-800 text-white font-semibold py-3 rounded-xl transition-all text-sm flex justify-center items-center gap-2">
                 <FileText className="w-4 h-4"/> Copy Message
               </button>
            </div>
          </div>
        </div>
      )}

      {/* OFF-SCREEN RENDER TARGET */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div id="share-image-wrapper" style={{ backgroundColor: '#ffffff', width: '520px', padding: '40px' }}>
          <div style={{ backgroundColor: '#ffffff' }} className="w-full p-8 rounded-[36px] space-y-6 border border-neutral-200/80">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-neutral-900 tracking-tight">{eventData?.name || 'Bill Summary'}</h2>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mt-1">Total Spending & Settlements</p>
            </div>

            <div className="bg-neutral-50/70 border border-neutral-200/60 rounded-3xl p-6">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-neutral-900"/> Total Spending
              </h3>
              <div className="space-y-4">
                {settlement?.participant_breakdown?.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between pb-4 border-b border-neutral-200/40 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-neutral-900 text-sm">{p.name}</span>
                    </div>
                    <span className="font-bold text-neutral-900 text-sm">{formatIDR(p.total_spent)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-neutral-50/70 border border-neutral-200/60 rounded-3xl p-6">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-neutral-900"/> Recommended Settlements
              </h3>
              <div className="space-y-3">
                {settlement?.settlements?.length > 0 ? (
                  settlement.settlements.map((s, index) => (
                    <div key={index} className="bg-white border border-neutral-200/60 px-4 py-3 rounded-2xl text-xs flex items-center justify-between text-neutral-800">
                      <div className="flex items-center gap-2 font-bold">
                        <span className="text-neutral-900">{s.from}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-400"/>
                        <span className="text-neutral-900">{s.to}</span>
                      </div>
                      <span className="font-bold text-neutral-900 bg-neutral-100/80 px-2.5 py-1 rounded-xl">
                        {formatIDR(s.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-400 italic font-medium">No transfers required.</p>
                )}
              </div>
            </div>
            
            <div className="text-center pt-4 pb-2">
              <span className="text-xl font-semibold text-neutral-400 tracking-wide">
                Tabbed by
              </span>
              <strong className="text-neutral-900 font-black tracking-tighter text-4xl ml-2">
                Tiara
              </strong>
            </div>
          </div>
        </div>
      </div>

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
            <h1 
              className={`text-xl font-semibold tracking-tight text-neutral-900 ${isSharedView ? '' : 'cursor-pointer'}`} 
              onClick={() => { if (!isSharedView) { setCurrentEventId(null); setCurrentView('dashboard'); } }}
            >
              Tabbed
            </h1>
          </div>
          
          {eventData && currentView === 'summary' && !isSharedView && (
            <button 
              onClick={handleOpenShareModal}
              disabled={isSharing}
              className="sm:hidden flex items-center gap-1.5 bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <Share2 className="w-3.5 h-3.5"/> {isSharing ? "Loading..." : "Share"}
            </button>
          )}
        </div>

        {currentEventId && !isSharedView && (
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

        <div className="flex items-center gap-4">
          {eventData && currentView === 'summary' && !isSharedView && (
            <button 
              onClick={handleOpenShareModal}
              disabled={isSharing}
              className="hidden sm:flex items-center gap-2 bg-black hover:bg-neutral-800 text-white px-4 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              <Share2 className="w-3.5 h-3.5"/> {isSharing ? "Loading..." : "Share"}
            </button>
          )}
        </div>
      </header>

      <main className={`flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 grid grid-cols-1 ${isSharedView ? '' : 'md:grid-cols-3'} gap-8`}>
        
        {!isSharedView && (
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
                    No image photo available
                  </div>
                )}
              </div>
            ) : currentView === 'summary' && currentEventId ? (
              <div className="space-y-4 sticky top-24">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-black"/> Event Photos
                </h2>
                <div className="max-h-[75vh] overflow-y-auto pr-2 space-y-5 pb-8">
                  {eventData?.receipts?.filter(r => r.image_url).length > 0 ? (
                    eventData.receipts.map(r => r.image_url && (
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
                      No receipt photos available.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-black"/> New Event
                  </h2>
                  <form onSubmit={handleCreateEvent} className="space-y-3">
                    <input
                      type="text"
                      placeholder="e.g., Weekend Trip, Dinner"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-black transition-colors"
                    />
                    <button
                      type="submit"
                      className="w-full bg-black hover:bg-neutral-800 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm text-sm"
                    >
                      Create Event
                    </button>
                  </form>
                </div>

                {Array.isArray(events) && events.length > 0 && (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Events</h3>
                    <div className="space-y-1.5">
                      {events.map((ev) => (
                        <div key={ev.id} className={`flex items-center justify-between rounded-xl transition-all border ${currentEventId === ev.id ? 'bg-neutral-900 text-white shadow-xs border-transparent' : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-100'}`}>
                          <button
                            onClick={() => {
                              setCurrentEventId(ev.id);
                              setActiveReceiptId(null);
                              setCurrentView('dashboard');
                            }}
                            className="flex-1 text-left px-4 py-3 text-sm font-medium flex items-center justify-between"
                          >
                            <span className="truncate pr-2">{ev.name}</span>
                            <ChevronRight className={`w-4 h-4 flex-shrink-0 ${currentEventId === ev.id ? 'text-white' : 'text-neutral-400'}`} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteEvent(e, ev.id)}
                            className={`px-3 py-3 transition-colors ${currentEventId === ev.id ? 'text-neutral-400 hover:text-red-400' : 'text-neutral-400 hover:text-red-600'}`}
                            title="Delete Event"
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className={`${isSharedView ? '' : 'md:col-span-2'} space-y-6`}>
          {currentEventId && (!eventData || isLoadingEvent) ? (
            <div className="bg-neutral-50 border border-neutral-200 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="animate-spin w-8 h-8 border-4 border-neutral-200 border-t-black rounded-full mb-4"></div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Loading Event...</h3>
              <p className="text-sm text-neutral-500">Fetching latest receipts and calculations.</p>
            </div>
          ) : !currentEventId ? (
            <div className="bg-neutral-50 border border-neutral-200 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 text-black mb-4 shadow-xs">
                <Receipt className="w-6 h-6"/>
              </div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">No Event Selected</h3>
              <p className="text-sm text-neutral-500 max-w-sm">Create a new event on the left or select an existing one.</p>
            </div>
          ) : currentView === 'summary' ? (
            <div id="receipt-summary-card" className={`space-y-6 bg-white rounded-3xl ${isSharedView ? 'max-w-4xl mx-auto' : 'p-2 sm:p-4'}`}>
              
              {isSharedView && (
                <div className="bg-neutral-900 text-white border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-md flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">{eventData?.name} - Final Bill</h2>
                    <p className="text-sm text-neutral-400 mt-1">Here is the breakdown of what everyone owes.</p>
                  </div>
                  <div className="hidden sm:block">
                    <Receipt className="w-10 h-10 text-neutral-500 opacity-50"/>
                  </div>
                </div>
              )}

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <h2 className="text-2xl font-bold text-black tracking-tight mb-6">Participant Breakdown</h2>
                <div className="space-y-6">
                  {settlement?.participant_breakdown?.map((p, idx) => {
                    const groupedItems = [];
                    let currentTitle = "Other Items";
                    
                    (p.items || []).forEach(item => {
                        const matchedReceipt = eventData?.receipts?.find(r => 
                            r.items?.some(ri => ri.name === item.name)
                        );
                        
                        if (matchedReceipt) {
                            currentTitle = matchedReceipt.title;
                        }
                        
                        let group = groupedItems.find(g => g.title === currentTitle);
                        if (!group) {
                            group = { title: currentTitle, items: [] };
                            groupedItems.push(group);
                        }
                        group.items.push(item);
                    });

                    return (
                      <div key={idx} className="bg-neutral-50 border border-neutral-200 p-5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold text-lg text-black">{p.name}</span>
                          </div>
                          <span className="font-bold text-lg text-black whitespace-nowrap shrink-0">{formatIDR(p.total_spent)}</span>
                        </div>

                        <div className="space-y-5">
                          {groupedItems.map((group, gIdx) => (
                            <div key={gIdx} className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200/60 pb-1.5 mb-2">{group.title}</p>
                              {group.items.map((item, iIdx) => {
                                const displayName = item.name ? item.name.replace(' (Proportional)', '') : '';
                                return (
                                  <div key={iIdx} className="flex justify-between items-start text-sm py-1.5 gap-4">
                                    <div className="flex items-center flex-wrap gap-2">
                                      <span className="text-neutral-700 leading-snug">{displayName}</span>
                                      {item.quantity > 1 && (
                                        <span className="bg-neutral-100 text-neutral-600 text-xs px-2 py-0.5 rounded-md font-semibold whitespace-nowrap">
                                          x{item.quantity}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-medium text-neutral-900 whitespace-nowrap shrink-0 text-right">
                                      {formatNumberOnly(item.price)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(!settlement?.participant_breakdown || settlement.participant_breakdown.length === 0) && (
                    <p className="text-sm text-neutral-500 italic">No items assigned yet.</p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-black"/> Calculation Summary
                </h3>
                <div className="space-y-3">
                  {settlement?.participant_breakdown?.map((p, idx) => (
                    <div key={idx} className="bg-neutral-50 border border-neutral-200/60 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm">
                      <span className="font-bold text-black">{p.name}</span>
                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                        <span className="text-neutral-600">Paid: <strong className="text-black">{formatIDR(p.total_paid)}</strong></span>
                        <span className="text-neutral-600">Spent: <strong className="text-black">{formatIDR(p.total_spent)}</strong></span>
                        <span className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap shrink-0 ${p.net_balance >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                          Net: {formatIDR(p.net_balance)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-black"/> Recommended Settlements
                </h3>
                <div className="space-y-2">
                  {settlement?.settlements?.length > 0 ? (
                    settlement.settlements.map((s, index) => (
                      <div key={index} className="bg-neutral-50 border border-neutral-200/60 px-4 py-3 rounded-xl text-sm flex items-center justify-between text-neutral-800">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="text-black font-semibold">{s.from}</span>
                          <ArrowRight className="w-4 h-4 text-neutral-400"/>
                          <span className="text-black font-semibold">{s.to}</span>
                        </div>
                        <span className="font-semibold text-black bg-white px-3 py-1 rounded-lg border border-neutral-200 whitespace-nowrap shrink-0">
                          {formatIDR(s.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-400 italic">No transfers required.</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeReceipt ? (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
              <button
                onClick={() => setActiveReceiptId(null)}
                className="flex items-center text-sm font-medium text-neutral-500 hover:text-black transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2"/> Back to Dashboard
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-black tracking-tight">{activeReceipt.title}</h2>
                  <p className="text-sm text-neutral-500 mt-1">Assign items and adjust amounts</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Total</p>
                  <p className="text-2xl font-semibold text-black tracking-tight whitespace-nowrap shrink-0">
                    {formatIDR(activeTotals?.total)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {activeReceipt.items?.map((item) => (
                  <div key={item.id} className="bg-neutral-50 border border-neutral-200/60 p-4 rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-neutral-900">{item.name}</p>
                        {item.quantity > 1 && (
                          <div className="flex items-center gap-1.5 ml-1">
                            <span className="bg-neutral-100 border border-neutral-200 text-neutral-600 text-xs px-2 py-0.5 rounded-md font-semibold whitespace-nowrap">
                              x{item.quantity}
                            </span>
                            <button
                              onClick={() => handleSplitItem(item.id)}
                              disabled={splittingItemId === item.id}
                              className={`bg-black hover:bg-neutral-800 text-white text-[10px] px-2 py-1 rounded-md font-bold transition-all shadow-sm flex items-center gap-1 ${splittingItemId === item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Split into individual items"
                            >
                              <Scissors className="w-3 h-3"/> {splittingItemId === item.id ? "Splitting..." : "Split"}
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-end gap-1 w-full sm:w-auto">
                        <span className="text-xs text-neutral-400">Rp</span>
                        <input
                          type="text"
                          value={item.price !== "" ? item.price : ""}
                          onChange={(e) => handleUpdateItemPriceLocally(item.id, e.target.value)}
                          onBlur={(e) => handleBlurItemPrice(item.id, e.target.value)}
                          className="w-32 text-right bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-neutral-900 focus:outline-none focus:border-black shadow-2xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 border-t border-neutral-200/40">
                      {eventData?.participants?.map((p) => {
                        const isSelected = item.participants?.some(ip => ip.id === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              handleToggleParticipant(item, p.id);
                            }}
                            onClick={() => handleToggleParticipant(item, p.id)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all select-none touch-manipulation ${
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

                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 space-y-3 mt-6">
                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="text-neutral-500 font-medium">Subtotal</span>
                    <span className="font-semibold text-neutral-900 whitespace-nowrap shrink-0">
                      {formatIDR(activeTotals?.subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="text-neutral-500 font-medium flex items-center gap-2">
                      Tax (Pajak) {activeTotals?.isInclusive && <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shadow-xs">Inclusive</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">Rp</span>
                      <input
                        type="text"
                        value={activeReceipt.tax ?? ""}
                        onChange={(e) => handleUpdateReceiptFeeLocally('tax', e.target.value)}
                        onBlur={(e) => handleBlurReceiptFee('tax', e.target.value)}
                        className="w-32 text-right bg-white border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-black"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="text-neutral-500 font-medium">Service (Servis)</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">Rp</span>
                      <input
                        type="text"
                        value={activeReceipt.service ?? ""}
                        onChange={(e) => handleUpdateReceiptFeeLocally('service', e.target.value)}
                        onBlur={(e) => handleBlurReceiptFee('service', e.target.value)}
                        className="w-32 text-right bg-white border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-black"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="text-neutral-500 font-medium">Discount (Diskon)</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">Rp</span>
                      <input
                        type="text"
                        value={activeReceipt.discount !== undefined ? (activeReceipt.discount < 0 ? activeReceipt.discount : -Math.abs(activeReceipt.discount)) : ""}
                        onChange={(e) => handleUpdateReceiptFeeLocally('discount', e.target.value)}
                        onBlur={(e) => handleBlurReceiptFee('discount', e.target.value)}
                        className="w-32 text-right bg-white border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-black"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm gap-4">
                    <span className="text-neutral-500 font-medium">Others / Delivery (Lainnya)</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-neutral-400">Rp</span>
                      <input
                        type="text"
                        value={activeReceipt.others ?? ""}
                        onChange={(e) => handleUpdateReceiptFeeLocally('others', e.target.value)}
                        onBlur={(e) => handleBlurReceiptFee('others', e.target.value)}
                        className="w-32 text-right bg-white border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-black"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-200 flex justify-between text-base font-bold gap-4">
                    <span className="text-black">Total</span>
                    <span className="text-black whitespace-nowrap shrink-0">
                      {formatIDR(activeTotals?.total)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveReceiptId(null)}
                  className="w-full mt-6 bg-black hover:bg-neutral-800 text-white font-medium py-3 rounded-xl transition-all shadow-sm text-sm flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4"/> Back to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">

              {currentEventId && eventData && (
                <div className="bg-white border border-neutral-200 rounded-xl px-5 py-3.5 shadow-sm mb-2">
                  <h2 className="text-lg font-bold tracking-tight text-neutral-900">{eventData.name}</h2>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-black"/> Receipts
                    </h3>
                    
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                        {isUploading ? "Uploading & Scanning..." : "Upload Receipts"}
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
                  </div>
                </div>

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
                      {eventData?.participants?.map((p) => (
                        <div key={p.id} className="bg-neutral-50 border border-neutral-200/60 px-3.5 py-2 rounded-xl text-sm flex items-center justify-between text-neutral-800">
                          <span>{p.name}</span>
                          <button
                            onClick={() => handleDeleteParticipant(p.id)}
                            className="text-neutral-400 hover:text-red-600 transition-colors p-1"
                            title="Delete participant"
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      ))}
                      {(!eventData?.participants || eventData?.participants.length === 0) && (
                        <p className="text-xs text-neutral-400 italic">No participants added yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-black"/> Scanned Receipts
                  </h3>
                </div>
                <div className="space-y-4">
                  {eventData?.receipts?.map((r) => {
                    const totalPaidForReceipt = r.payers?.reduce((acc, curr) => acc + (parseFloat(curr.amount_paid) || 0), 0) || 0;
                    const rTotals = calculateReceiptTotals(r);
                    const isUnderpaid = totalPaidForReceipt < (rTotals.total - 0.1);

                    return (
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
                          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                            <span className="font-semibold text-black whitespace-nowrap shrink-0">{formatIDR(rTotals.total)}</span>
                            <button
                              onClick={() => setActiveReceiptId(r.id)}
                              className="bg-black hover:bg-neutral-800 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                            >
                              Assign
                            </button>
                            <button
                              onClick={() => handleDeleteReceipt(r.id)}
                              className="text-neutral-400 hover:text-red-600 transition-colors p-2"
                              title="Delete receipt"
                            >
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-neutral-200/60">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Who Paid?</p>
                            {isUnderpaid && (
                              <span className="flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                                <AlertCircle className="w-3.5 h-3.5"/> Total paid ({formatIDR(totalPaidForReceipt)}) is less than receipt total ({formatIDR(rTotals.total)})
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {eventData?.participants?.map((p) => {
                              const existingPayer = r.payers?.find(pr => pr.participant_id === p.id);
                              const paidAmount = existingPayer && existingPayer.amount_paid !== 0 ? existingPayer.amount_paid : "";
                              return (
                                <div key={p.id} className="flex items-center justify-between bg-white border border-neutral-200 px-3 py-1.5 rounded-lg">
                                  <span className="text-xs font-medium text-neutral-700">{p.name}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-neutral-400">Rp</span>
                                    <input
                                      type="text"
                                      placeholder="0"
                                      value={paidAmount}
                                      onChange={(e) => handleUpdatePayerAmount(r, p.id, e.target.value)}
                                      onBlur={(e) => handleBlurPayerAmount(r, p.id, e.target.value)}
                                      className="w-28 text-right bg-neutral-50 border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-900 focus:outline-none focus:border-black"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(!eventData?.receipts || eventData?.receipts.length === 0) && (
                    <p className="text-xs text-neutral-400 italic text-center py-4">No receipts recorded yet.</p>
                  )}
                </div>
              </div>

              {isReadyForSummary && (
                <div className="bg-white border border-neutral-200 rounded-3xl p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col sm:flex-row items-center justify-between gap-6 transition-all animate-in fade-in zoom-in-95">
                  <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center shrink-0">
                      <Check className="w-6 h-6 text-neutral-800"/>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-neutral-900 tracking-tight">All Set!</h3>
                      <p className="text-sm text-neutral-500 font-medium mt-1">All items are assigned and bills are fully covered.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setCurrentView('summary'); setActiveReceiptId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="w-full sm:w-auto bg-black hover:bg-neutral-800 text-white px-8 py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-md"
                  >
                    View Summary <ArrowRight className="w-4 h-4"/>
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </main>
    </div>
  );
}