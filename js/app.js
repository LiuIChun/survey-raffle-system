    /* ==========================================================================
       LOCAL UI & CONTROLLER LOGIC
       ========================================================================== */
    let isPrivacyMasked = true;
    let isDrawingRunning = false;
    let audioCtx = null;

    window.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
      renderPrizeList();
      updateStagePrizeOptions();
      updateStats();
    });

    function switchTab(tabKey) {
      const tabs = ['import', 'prizes', 'draw', 'results'];
      tabs.forEach(key => {
        const btn = document.getElementById(`tab-${key}`);
        const content = document.getElementById(`content-${key}`);
        if (key === tabKey) {
          btn.classList.add('border-brand-500', 'bg-white', 'text-brand-600', 'shadow-md');
          btn.classList.remove('border-white/80', 'bg-white/60', 'text-slate-500');
          content.classList.remove('hidden');
        } else {
          btn.classList.remove('border-brand-500', 'bg-white', 'text-brand-600', 'shadow-md');
          btn.classList.add('border-white/80', 'bg-white/60', 'text-slate-500');
          content.classList.add('hidden');
        }
      });

      if (tabKey === 'prizes') renderPrizeList();
      if (tabKey === 'draw') {
        updateStagePrizeOptions();
        checkStageStatus();
      }
      if (tabKey === 'results') renderResultsTable();
    }

    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const buffer = e.target.result;
        let text = new TextDecoder('utf-8').decode(buffer);
        if (text.includes('\uFFFD')) {
          try {
            text = new TextDecoder('big5').decode(buffer);
          } catch (err) {
            console.warn('Big5 decode fallback');
          }
        }
        processCSVText(text);
      };
      reader.readAsArrayBuffer(file);
      event.target.value = '';
    }

    function processCSVText(csvText) {
      if (!csvText || !csvText.trim()) {
        showToast('CSV 檔案內容為空！', 'error');
        return;
      }

      const lines = csvText.split(/\r\n|\n|\r/).map(line => line.trim()).filter(line => line !== '');
      if (lines.length === 0) {
        showToast('CSV 檔案內無任何資料！', 'error');
        return;
      }

      const firstLine = lines[0];
      const delimiter = firstLine.includes('\t') ? '\t' : ',';
      
      const splitRow = (row) => splitCSVRow(row, delimiter);
      const headers = splitRow(firstLine.toLowerCase());

      let nameIdx = headers.findIndex(h => /名|name|使用者|會員|填答|受訪|帳號|user|姓名/i.test(h));
      let emailIdx = headers.findIndex(h => /email|mail|郵件|信箱|電子郵件/i.test(h));
      let phoneIdx = headers.findIndex(h => /phone|tel|mobile|電話|手機|聯絡|行動電話/i.test(h));

      let startRow = 1;

      if (nameIdx === -1 && emailIdx === -1 && phoneIdx === -1) {
        startRow = 0;
        const sampleCols = splitRow(lines[0]);
        sampleCols.forEach((col, idx) => {
          if (col.includes('@') && emailIdx === -1) emailIdx = idx;
          else if (/[\d-]{7,}/.test(col) && phoneIdx === -1) phoneIdx = idx;
          else if (nameIdx === -1) nameIdx = idx;
        });
      }

      let parsed = [];
      const batchTag = Date.now().toString(36);

      for (let i = startRow; i < lines.length; i++) {
        const cols = splitRow(lines[i]);
        if (cols.length === 0 || cols.every(c => !c)) continue;

        let name = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].trim() : '';
        let email = emailIdx !== -1 && cols[emailIdx] ? cols[emailIdx].trim() : '';
        let phone = phoneIdx !== -1 && cols[phoneIdx] ? cols[phoneIdx].trim() : '';

        if (!email) {
          const foundEmail = cols.find(c => c.includes('@'));
          if (foundEmail) email = foundEmail.trim();
        }
        if (!phone) {
          const foundPhone = cols.find(c => /^09[\d\s-]{8,}$/.test(c.trim()) || /^[\d\s-]{7,12}$/.test(c.trim()));
          if (foundPhone) phone = foundPhone.trim();
        }
        if (!name && cols.length > 0) {
          const foundName = cols.find(c => c !== email && c !== phone && c.length > 0);
          if (foundName) name = foundName.trim();
        }

        if (name || email || phone) {
          parsed.push({
            id: `u_${batchTag}_${i}_` + Math.random().toString(36).substr(2, 6),
            name: name || '未提供姓名',
            email: email || '',
            phone: phone || ''
          });
        }
      }

      if (parsed.length === 0) {
        showToast('無法辨識有效的資料欄位，請檢查檔案格式！', 'error');
        return;
      }

      window.saveParticipantsToCloud(parsed);
    }

    function splitCSVRow(rowText, delimiter = ',') {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.replace(/^"|"$/g, '').trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.replace(/^"|"$/g, '').trim());
      return result;
    }

    function applyDeduplication() {
      const seen = new Set();
      const uniquePool = [];

      (window.rawData || []).forEach(item => {
        const key = (item.email ? 'e:' + item.email.toLowerCase() : '') ||
                    (item.phone ? 'p:' + item.phone.replace(/[\s-]/g, '') : '') ||
                    ('n:' + item.name);

        if (key && !seen.has(key)) {
          seen.add(key);
          uniquePool.push(item);
        }
      });

      const winnerIds = new Set((window.winnersList || []).map(w => w.id));
      window.eligiblePool = uniquePool.filter(user => !winnerIds.has(user.id));

      updateStats();
      renderImportTable();
      updateStagePrizeOptions();
      checkStageStatus();
    }

    function generateMockData() {
      const familyNames = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪'];
      const givenNames = ['冠宇', '雅婷', '家豪', '詩涵', '志明', '怡君', '建宏', '佩玲', '宗翰', '淑芬', '威倫', '美玲'];
      const domains = ['gmail.com', 'yahoo.com.tw', 'outlook.com', 'hotmail.com'];

      let mock = [];
      const batchId = Date.now().toString(36);

      for (let i = 1; i <= 50; i++) {
        const name = familyNames[Math.floor(Math.random() * familyNames.length)] + givenNames[Math.floor(Math.random() * givenNames.length)];
        const email = `user_${batchId}_${100 + i}@${domains[Math.floor(Math.random() * domains.length)]}`;
        const phone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;

        mock.push({
          id: `mock_${batchId}_${i}`,
          name: name,
          email: i % 7 === 0 ? '' : email,
          phone: i % 11 === 0 ? '' : phone
        });
      }

      window.saveParticipantsToCloud(mock);
    }

    function openPasteModal() {
      document.getElementById('pasteInputText').value = '';
      document.getElementById('pasteModal').classList.remove('hidden');
    }

    function closePasteModal() {
      document.getElementById('pasteModal').classList.add('hidden');
    }

    function submitPastedData() {
      const text = document.getElementById('pasteInputText').value;
      if (!text || !text.trim()) {
        showToast('請先貼上資料文字！', 'error');
        return;
      }
      closePasteModal();
      processCSVText(text);
    }

    function clearImportedData() {
      showModal('確認清空雲端名單', '確定要清空雲端資料庫的名單嗎？所有連線中的使用者將同步更新。', () => {
        window.clearParticipantsFromCloud();
      });
    }

    function updateStats() {
      const rawCount = (window.rawData || []).length;
      const validCount = (window.eligiblePool || []).length;
      const winnersCount = (window.winnersList || []).length;
      const dedupeCount = Math.max(0, rawCount - (validCount + winnersCount));

      document.getElementById('statRawCount').innerText = rawCount;
      document.getElementById('statDedupeCount').innerText = dedupeCount;
      document.getElementById('statValidCount').innerText = validCount;

      document.getElementById('headerPoolCount').innerText = validCount;
      document.getElementById('headerWinnerCount').innerText = winnersCount;

      document.getElementById('clearDataBtn').disabled = rawCount === 0;
      document.getElementById('toPrizesBtn').disabled = validCount === 0;

      const summaryText = document.getElementById('dataSummaryText');
      if (rawCount > 0) {
        summaryText.innerText = `雲端共有 ${rawCount} 筆資料，過濾後有 ${validCount} 人具備抽獎資格。`;
      } else {
        summaryText.innerText = '尚未匯入資料，請選擇 CSV 檔案或使用測試資料。';
      }

      const eligibleCountText = document.getElementById('prizeEligibleCountText');
      if (eligibleCountText) eligibleCountText.innerText = validCount;
    }

    function renderImportTable() {
      const tbody = document.getElementById('importTableBody');
      const raw = window.rawData || [];

      if (raw.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="py-8 text-center text-slate-400">
              <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
              等待資料匯入...
            </td>
          </tr>`;
        lucide.createIcons();
        return;
      }

      const winnersSet = new Set((window.winnersList || []).map(w => w.id));
      const seenKey = new Set();

      tbody.innerHTML = raw.slice(0, 100).map((row, idx) => {
        const key = (row.email ? 'e:' + row.email.toLowerCase() : '') ||
                    (row.phone ? 'p:' + row.phone.replace(/[\s-]/g, '') : '') ||
                    ('n:' + row.name);

        let statusBadge = '';
        if (winnersSet.has(row.id)) {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-bold border border-amber-200">已中獎</span>';
        } else if (seenKey.has(key)) {
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-brand-700 font-bold border border-rose-200">重複剔除</span>';
        } else {
          seenKey.add(key);
          statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">合格參抽</span>';
        }

        return `
          <tr class="hover:bg-rose-50/40">
            <td class="py-2.5 px-3 text-slate-400 font-mono">${idx + 1}</td>
            <td class="py-2.5 px-3 font-semibold text-slate-800">${escapeHtml(row.name)}</td>
            <td class="py-2.5 px-3 text-slate-600">${row.email ? maskString(row.email, 'email') : '<span class="text-slate-400">無</span>'}</td>
            <td class="py-2.5 px-3 text-slate-600 font-mono">${row.phone ? maskString(row.phone, 'phone') : '<span class="text-slate-400">無</span>'}</td>
            <td class="py-2.5 px-3 text-right">${statusBadge}</td>
          </tr>
        `;
      }).join('');

      lucide.createIcons();
    }

    function renderPrizeList() {
      const container = document.getElementById('prizeListContainer');
      let totalQuota = 0;
      const prizesArr = window.prizes || [];

      container.innerHTML = prizesArr.map((prize, idx) => {
        const drawnCount = (window.winnersList || []).filter(w => w.prizeId === prize.id).length;
        totalQuota += prize.quota;

        return `
          <div class="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div class="flex items-center gap-3 flex-grow">
              <span class="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-xs shrink-0">${idx + 1}</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-grow">
                <div>
                  <label class="text-[10px] text-slate-400 font-semibold block mb-1">獎項名稱</label>
                  <input type="text" value="${escapeHtml(prize.name)}" onchange="updatePrize('${prize.id}', 'name', this.value)" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-800 font-semibold focus:outline-none focus:border-brand-500">
                </div>
                <div>
                  <label class="text-[10px] text-slate-400 font-semibold block mb-1">名額 (位)</label>
                  <input type="number" min="1" value="${prize.quota}" onchange="updatePrize('${prize.id}', 'quota', parseInt(this.value, 10))" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-brand-600 font-black focus:outline-none focus:border-brand-500">
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
              <div class="text-right">
                <div class="text-xs text-slate-400">已抽出 / 名額</div>
                <div class="text-sm font-black text-slate-800">${drawnCount} / <span class="text-amber-500">${prize.quota}</span></div>
              </div>
              <button onclick="removePrize('${prize.id}')" class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('totalPrizeQuotaText').innerText = totalQuota;
      lucide.createIcons();
    }

    function addPrizeRow() {
      const newId = 'p_' + Date.now();
      const newPrize = {
        id: newId,
        name: `新獎項 ${(window.prizes || []).length + 1}`,
        quota: 1,
        icon: 'gift'
      };
      if (window.savePrizeToCloud) window.savePrizeToCloud(newPrize);
    }

    function updatePrize(id, field, value) {
      const p = (window.prizes || []).find(x => x.id === id);
      if (p) {
        p[field] = value;
        if (window.savePrizeToCloud) window.savePrizeToCloud(p);
      }
    }

    function removePrize(id) {
      if ((window.prizes || []).length <= 1) {
        showToast('至少需要保留一個獎項', 'error');
        return;
      }
      if (window.deletePrizeFromCloud) window.deletePrizeFromCloud(id);
    }

    function updateStagePrizeOptions() {
      const select = document.getElementById('stagePrizeSelect');
      const filterSelect = document.getElementById('resultPrizeFilter');
      if (!select || !filterSelect) return;

      const currentSelectedVal = select.value;
      const prizesArr = window.prizes || [];

      select.innerHTML = prizesArr.map(p => {
        const drawn = (window.winnersList || []).filter(w => w.prizeId === p.id).length;
        const remaining = Math.max(0, p.quota - drawn);
        return `<option value="${p.id}">${escapeHtml(p.name)} (剩餘 ${remaining}/${p.quota})</option>`;
      }).join('');

      if (currentSelectedVal && prizesArr.some(p => p.id === currentSelectedVal)) {
        select.value = currentSelectedVal;
      }

      filterSelect.innerHTML = `<option value="ALL">全部獎項</option>` +
        prizesArr.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

      handleStagePrizeChange();
    }

    function handleStagePrizeChange() {
      const select = document.getElementById('stagePrizeSelect');
      if (!select) return;

      const prizeId = select.value;
      const prize = (window.prizes || []).find(p => p.id === prizeId);

      if (!prize) return;

      const drawn = (window.winnersList || []).filter(w => w.prizeId === prize.id).length;
      const remaining = Math.max(0, prize.quota - drawn);

      document.getElementById('stagePrizeProgress').innerHTML = `
        名額：<span class="text-yellow-200 font-bold">${prize.quota}</span> 名 |
        已抽出：<span class="text-white font-bold">${drawn}</span> 名 |
        剩餘：<span class="text-yellow-300 font-bold">${remaining}</span> 名
      `;

      checkStageStatus();
    }

    function checkStageStatus() {
      const select = document.getElementById('stagePrizeSelect');
      if (!select) return;

      const prizeId = select.value;
      const prize = (window.prizes || []).find(p => p.id === prizeId);

      const drawOneBtn = document.getElementById('drawOneBtn');
      const drawAllBtn = document.getElementById('drawAllBtn');

      if (!prize || (window.eligiblePool || []).length === 0 || isDrawingRunning) {
        drawOneBtn.disabled = true;
        drawAllBtn.disabled = true;
        return;
      }

      const drawn = (window.winnersList || []).filter(w => w.prizeId === prize.id).length;
      const remaining = Math.max(0, prize.quota - drawn);

      drawOneBtn.disabled = remaining === 0;
      drawAllBtn.disabled = remaining === 0;
    }

    function triggerDraw(countToDraw = 1) {
      if (isDrawingRunning || (window.eligiblePool || []).length === 0) return;

      const select = document.getElementById('stagePrizeSelect');
      const prize = (window.prizes || []).find(p => p.id === select.value);
      if (!prize) return;

      const drawn = (window.winnersList || []).filter(w => w.prizeId === prize.id).length;
      const remaining = Math.max(0, prize.quota - drawn);

      if (remaining === 0) {
        showToast('該獎項名額已全數抽出！', 'error');
        return;
      }

      isDrawingRunning = true;
      document.getElementById('drawOneBtn').disabled = true;
      document.getElementById('drawAllBtn').disabled = true;

      const tickerCard = document.getElementById('tickerCard');
      const tickerName = document.getElementById('tickerName');
      const tickerDetail = document.getElementById('tickerDetail');
      const tickerSubLabel = document.getElementById('tickerSubLabel');

      tickerCard.classList.add('animate-glow');
      tickerSubLabel.innerText = `Drawing for: ${prize.name}`;

      let speed = 50;
      let duration = 2200;
      let elapsed = 0;

      playBeepSound(440, 0.05);

      const interval = setInterval(() => {
        const pool = window.eligiblePool || [];
        if (pool.length === 0) return;
        const randomIndex = Math.floor(Math.random() * pool.length);
        const candidate = pool[randomIndex];

        tickerName.innerText = candidate.name;
        tickerDetail.innerText = maskString(candidate.email || candidate.phone || '', 'auto');

        if (document.getElementById('soundToggle').checked && elapsed % 100 === 0) {
          playBeepSound(600 + Math.random() * 200, 0.03);
        }

        elapsed += speed;
        if (elapsed >= duration) {
          clearInterval(interval);
          finalizeDraw(prize, countToDraw);
        }
      }, speed);
    }

    function triggerDrawAll() {
      const select = document.getElementById('stagePrizeSelect');
      const prize = (window.prizes || []).find(p => p.id === select.value);
      if (!prize) return;

      const drawn = (window.winnersList || []).filter(w => w.prizeId === prize.id).length;
      const remaining = Math.max(0, prize.quota - drawn);

      if (remaining === 0) {
        showToast('該獎項名額已全數抽出！', 'error');
        return;
      }

      showModal('確認一次全抽', `確定要一次抽出「${prize.name}」剩餘的 ${remaining} 位中獎者嗎？`, () => {
        triggerDraw(remaining);
      });
    }

    async function finalizeDraw(prize, countToDraw) {
      const pool = [...(window.eligiblePool || [])];
      const actualDrawCount = Math.min(countToDraw, pool.length);
      const drawnWinners = [];

      for (let i = 0; i < actualDrawCount; i++) {
        const randomIndex = Math.floor(Math.random() * pool.length);
        const winner = pool.splice(randomIndex, 1)[0];

        const winnerRecord = {
          ...winner,
          prizeId: prize.id,
          prizeName: prize.name,
          drawnAt: new Date().toLocaleTimeString('zh-TW', { hour12: false })
        };

        drawnWinners.push(winnerRecord);
        if (window.commitWinnerToCloud) {
          await window.commitWinnerToCloud(winnerRecord);
        }
      }

      isDrawingRunning = false;

      const tickerCard = document.getElementById('tickerCard');
      const tickerName = document.getElementById('tickerName');
      const tickerDetail = document.getElementById('tickerDetail');
      const tickerSubLabel = document.getElementById('tickerSubLabel');

      tickerCard.classList.remove('animate-glow');

      if (drawnWinners.length === 1) {
        const w = drawnWinners[0];
        tickerSubLabel.innerText = `🎉 恭喜中獎！ [ ${prize.name} ]`;
        tickerName.innerText = w.name;
        tickerDetail.innerText = `Email: ${w.email || '無'} | 電話: ${w.phone || '無'}`;
      } else {
        tickerSubLabel.innerText = `🎉 批量開獎完成！ [ ${prize.name} ]`;
        tickerName.innerText = `共抽出 ${drawnWinners.length} 位中獎者`;
        tickerDetail.innerText = `請至「中獎紀錄」分頁查看完整的名單紀錄`;
      }

      playFanfareSound();
      fireConfetti();
      showToast(`抽獎完成！已同步寫入雲端`, 'success');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function maskString(str, type = 'auto') {
      if (!str) return '';
      if (!isPrivacyMasked) return str;

      if (type === 'email' || (type === 'auto' && str.includes('@'))) {
        const parts = str.split('@');
        if (parts.length < 2) return str;
        const name = parts[0];
        const maskedName = name.length > 2 
          ? name.substring(0, 2) + '*'.repeat(Math.max(1, name.length - 2)) 
          : name + '*';
        return `${maskedName}@${parts[1]}`;
      }

      if (type === 'phone' || (type === 'auto' && /^\d+$/.test(str.replace(/[\s-]/g, '')))) {
        const cleaned = str.replace(/[\s-]/g, '');
        if (cleaned.length >= 7) {
          return cleaned.substring(0, 3) + '****' + cleaned.substring(cleaned.length - 3);
        }
        return str;
      }

      if (str.length <= 2) return str[0] + '*';
      return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
    }

    function renderResultsTable() {
      const filterVal = document.getElementById('resultPrizeFilter').value;
      const tbody = document.getElementById('resultsTableBody');
      const winners = window.winnersList || [];

      let filtered = winners;
      if (filterVal !== 'ALL') {
        filtered = winners.filter(w => w.prizeId === filterVal);
      }

      document.getElementById('resultsCountSummary').innerText = `共 ${filtered.length} 筆紀錄`;
      document.getElementById('exportCsvBtn').disabled = winners.length === 0;
      document.getElementById('resetWinnersBtn').disabled = winners.length === 0;

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="py-12 text-center text-slate-400">
              <i data-lucide="award" class="w-10 h-10 mx-auto mb-2 opacity-30"></i>
              ${winners.length === 0 ? '目前尚無中獎紀錄，請至「開獎舞台」進行抽獎。' : '該篩選條件下無中獎紀錄。'}
            </td>
          </tr>`;
        lucide.createIcons();
        return;
      }

      tbody.innerHTML = filtered.map(w => `
        <tr class="hover:bg-amber-50/30 transition-colors">
          <td class="py-3 px-4 font-bold text-amber-700">${escapeHtml(w.prizeName)}</td>
          <td class="py-3 px-4 font-semibold text-slate-900">${escapeHtml(maskString(w.name))}</td>
          <td class="py-3 px-4 text-slate-600 font-mono text-xs">${w.email ? escapeHtml(maskString(w.email, 'email')) : '<span class="text-slate-300">無</span>'}</td>
          <td class="py-3 px-4 text-slate-600 font-mono text-xs">${w.phone ? escapeHtml(maskString(w.phone, 'phone')) : '<span class="text-slate-300">無</span>'}</td>
          <td class="py-3 px-4 text-right text-slate-400 font-mono text-xs">${w.drawnAt || ''}</td>
        </tr>
      `).join('');

      lucide.createIcons();
    }

    function togglePrivacyMask() {
      isPrivacyMasked = !isPrivacyMasked;
      const btn = document.getElementById('maskToggleBtn');
      btn.innerHTML = isPrivacyMasked 
        ? `<i data-lucide="eye-off" class="w-4 h-4"></i> 隱私遮蔽：開啟`
        : `<i data-lucide="eye" class="w-4 h-4"></i> 隱私遮蔽：關閉`;
      lucide.createIcons();
      renderImportTable();
      renderResultsTable();
      showToast(isPrivacyMasked ? '已開啟隱私遮蔽' : '已關閉隱私遮蔽', 'info');
    }

    function exportWinnersCSV() {
      const winners = window.winnersList || [];
      if (winners.length === 0) {
        showToast('尚無中獎資料可供匯出', 'error');
        return;
      }

      let csv = '\uFEFF' + '獎項名稱,中獎姓名,Email,電話,中獎時間\n';
      winners.forEach(w => {
        const name = `"${(w.name || '').replace(/"/g, '""')}"`;
        const email = `"${(w.email || '').replace(/"/g, '""')}"`;
        const phone = `"${(w.phone || '').replace(/"/g, '""')}"`;
        const prize = `"${(w.prizeName || '').replace(/"/g, '""')}"`;
        const time = `"${w.drawnAt || ''}"`;
        csv += `${prize},${name},${email},${phone},${time}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `問卷抽獎中獎名單_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('中獎名單已開始下載', 'success');
    }

    function confirmResetWinners() {
      showModal('確認重置中獎紀錄', '警告：重置後雲端所有中獎紀錄將被清除，且人員將放回抽獎池中。', () => {
        if (window.resetWinnersInCloud) window.resetWinnersInCloud();
      });
    }

    let modalCallback = null;

    function showModal(title, message, onConfirm) {
      document.getElementById('modalTitle').innerText = title;
      document.getElementById('modalMessage').innerText = message;
      modalCallback = onConfirm;

      const actions = document.getElementById('modalActions');
      actions.innerHTML = `
        <button onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition">取消</button>
        <button onclick="executeModalConfirm()" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition shadow-sm">確定</button>
      `;

      document.getElementById('customModal').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('customModal').classList.add('hidden');
      modalCallback = null;
    }

    function executeModalConfirm() {
      if (modalCallback) modalCallback();
      closeModal();
    }

    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');

      const bgMap = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        info: 'bg-slate-800 text-white'
      };

      toast.className = `px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 pointer-events-auto transform transition-all duration-300 translate-y-2 opacity-0 ${bgMap[type] || bgMap.info}`;
      toast.innerText = message;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
      }, 10);

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    function playBeepSound(freq = 440, duration = 0.05) {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.value = freq;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    }

    function playFanfareSound() {
      if (!document.getElementById('soundToggle').checked) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        setTimeout(() => playBeepSound(freq, 0.2), idx * 120);
      });
    }

    function fireConfetti() {
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
