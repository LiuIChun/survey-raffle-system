    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { 
      getAuth, 
      signInAnonymously, 
      signInWithCustomToken 
    } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { 
      getFirestore, 
      collection, 
      doc, 
      setDoc, 
      deleteDoc, 
      onSnapshot, 
      writeBatch,
      getDocs
    } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

    /* ==========================================================================
       FIREBASE CONFIG & INITIALIZATION
       ========================================================================== */
    const appId = typeof __app_id !== 'undefined'
      ? __app_id
      : (window.APP_CONFIG && window.APP_CONFIG.appId) || 'lottery-system-app';
    const firebaseConfig = typeof __firebase_config !== 'undefined'
      ? JSON.parse(__firebase_config)
      : (window.APP_CONFIG && window.APP_CONFIG.firebaseConfig);

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    let currentUser = null;

    // Cloud Collection Paths strictly aligned with Rule 1
    const participantsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'participants');
    const prizesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'prizes');
    const winnersColRef = collection(db, 'artifacts', appId, 'public', 'data', 'winners');

    // System States
    window.rawData = [];
    window.eligiblePool = [];
    window.winnersList = [];
    window.prizes = [
      { id: 'p1', name: '頭獎 (MacBook Pro)', quota: 1, icon: 'laptop' },
      { id: 'p2', name: '二獎 (iPad Air)', quota: 2, icon: 'tablet' },
      { id: 'p3', name: '三獎 (7-11 500元禮券)', quota: 5, icon: 'gift' }
    ];

    let lastKnownWinnerCount = 0;

    /* ==========================================================================
       AUTHENTICATION & REALTIME LISTENERS
       ========================================================================== */
    async function initCloudSync() {
      const statusBadge = document.getElementById('syncStatusBadge');
      const statusText = document.getElementById('syncStatusText');

      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        currentUser = auth.currentUser;

        if (statusBadge && statusText) {
          statusBadge.className = "flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 font-medium";
          statusText.innerText = "🟢 多人同步中";
        }

        // Attach Realtime Listeners
        setupParticipantsListener();
        setupPrizesListener();
        setupWinnersListener();

      } catch (err) {
        console.warn("Cloud Auth / Sync fallback notice:", err);
        if (statusBadge && statusText) {
          statusBadge.className = "flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-200 font-medium";
          statusText.innerText = "🟡 展示模式 (本機數據)";
        }
        // Fallback default state
        applyDeduplication();
      }
    }

    // 1. Realtime Participants Listener
    function setupParticipantsListener() {
      if (!currentUser) return;
      onSnapshot(participantsColRef, (snapshot) => {
        const list = [];
        snapshot.forEach(docSnap => list.push(docSnap.data()));
        window.rawData = list;
        applyDeduplication();
      }, (err) => {
        console.error("Participants sync error:", err);
      });
    }

    // 2. Realtime Prizes Listener
    function setupPrizesListener() {
      if (!currentUser) return;
      onSnapshot(prizesColRef, (snapshot) => {
        if (snapshot.empty) {
          // Push default prizes to cloud if database is fresh
          seedDefaultPrizes();
          return;
        }
        const list = [];
        snapshot.forEach(docSnap => list.push(docSnap.data()));
        // Keep prize sort order
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        window.prizes = list;
        renderPrizeList();
        updateStagePrizeOptions();
      }, (err) => {
        console.error("Prizes sync error:", err);
      });
    }

    async function seedDefaultPrizes() {
      if (!currentUser) return;
      const batch = writeBatch(db);
      window.prizes.forEach((p, idx) => {
        const docRef = doc(prizesColRef, p.id);
        batch.set(docRef, { ...p, createdAt: Date.now() + idx });
      });
      await batch.commit();
    }

    // 3. Realtime Winners Listener
    function setupWinnersListener() {
      if (!currentUser) return;
      onSnapshot(winnersColRef, (snapshot) => {
        const list = [];
        snapshot.forEach(docSnap => list.push(docSnap.data()));
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const isNewWinnerDrawn = list.length > lastKnownWinnerCount && lastKnownWinnerCount !== 0;
        lastKnownWinnerCount = list.length;

        window.winnersList = list;
        applyDeduplication();
        renderResultsTable();
        updateStagePrizeOptions();

        if (isNewWinnerDrawn) {
          // Trigger confetti for all connected viewers when someone draws!
          fireConfetti();
          playFanfareSound();
          showToast('⚡ 雲端有最新中獎結果產生！', 'success');
        }
      }, (err) => {
        console.error("Winners sync error:", err);
      });
    }

    /* ==========================================================================
       EXPOSED CLOUD MUTATION WRAPPERS
       ========================================================================== */
    window.saveParticipantsToCloud = async function(parsedItems) {
      if (!currentUser) {
        window.rawData = parsedItems;
        applyDeduplication();
        return;
      }

      showToast('正在寫入雲端資料庫...', 'info');
      // Write batch to Firestore
      const batch = writeBatch(db);
      parsedItems.forEach(item => {
        const docRef = doc(participantsColRef, item.id);
        batch.set(docRef, item);
      });

      await batch.commit();
      showToast(`已成功同步 ${parsedItems.length} 筆資料至雲端！`, 'success');
    };

    window.clearParticipantsFromCloud = async function() {
      if (!currentUser) {
        window.rawData = [];
        applyDeduplication();
        return;
      }

      const snapshot = await getDocs(participantsColRef);
      const batch = writeBatch(db);
      snapshot.forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
      showToast('已清空雲端抽獎名單', 'info');
    };

    window.savePrizeToCloud = async function(prizeObj) {
      if (!currentUser) return;
      const docRef = doc(prizesColRef, prizeObj.id);
      await setDoc(docRef, { ...prizeObj, createdAt: prizeObj.createdAt || Date.now() });
    };

    window.deletePrizeFromCloud = async function(prizeId) {
      if (!currentUser) return;
      const docRef = doc(prizesColRef, prizeId);
      await deleteDoc(docRef);
    };

    window.commitWinnerToCloud = async function(winnerRecord) {
      if (!currentUser) {
        window.winnersList.push(winnerRecord);
        applyDeduplication();
        return;
      }
      const docRef = doc(winnersColRef, winnerRecord.id);
      await setDoc(docRef, { ...winnerRecord, timestamp: Date.now() });
    };

    window.resetWinnersInCloud = async function() {
      if (!currentUser) {
        window.winnersList = [];
        applyDeduplication();
        return;
      }
      const snapshot = await getDocs(winnersColRef);
      const batch = writeBatch(db);
      snapshot.forEach(docSnap => batch.delete(docSnap.ref));
      await batch.commit();
      showToast('已重置雲端中獎紀錄', 'info');
    };

    // Initialize on load
    window.addEventListener('DOMContentLoaded', () => {
      initCloudSync();
    });
