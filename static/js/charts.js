// static/js/charts.js
async function fetchMetrics() {
  try {
    const res = await fetch('/api/dashboard/summary');
    return res.ok ? res.json() : null;
  } catch(e) { console.error('fetchMetrics error', e); return null; }
}

function initCharts(data){
  if(!data) return;
  try{
    const attEl = document.getElementById('attendanceChart');
    const revEl = document.getElementById('revenueChart');
    if(attEl){
      const attCtx = attEl.getContext('2d');
      new Chart(attCtx, {
        type:'line',
        data: { labels: data.attendance.labels || [], datasets:[{label:'Attendance',data:data.attendance.values || [],backgroundColor:'rgba(0,230,216,0.12)',borderColor:'#00e6d8',fill:true}]},
        options:{responsive:true,maintainAspectRatio:false}
      });
    }
    if(revEl){
      const revCtx = revEl.getContext('2d');
      new Chart(revCtx, {
        type:'bar',
        data:{labels:data.revenue.labels || [],datasets:[{label:'Revenue',data:data.revenue.values || [],backgroundColor:'#ff9f7f'}]},
        options:{responsive:true,maintainAspectRatio:false}
      });
    }
  }catch(err){console.error('initCharts error', err)}
}

(async function(){
  const data = await fetchMetrics();
  if(!data) return;
  try{
    // fill the cards if present
    const map = {
      'm_total':'total_members','m_active':'active_members','att_today':'today_attendance','pending_pay':'pending_payments','recent_regs':'recent_regs'
    };
    Object.keys(map).forEach(id => { const el = document.getElementById(id); if(el) el.textContent = data.metrics[map[id]] ?? '—'; });
  }catch(e){console.warn('fill cards error',e)}
  initCharts(data);
})();
