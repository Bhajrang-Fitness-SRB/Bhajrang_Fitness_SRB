(function(){
  if (typeof window === 'undefined') return;
  document.addEventListener('DOMContentLoaded', function(){
    if (sessionStorage.getItem('welcome_shown')) return;
    const overlay = document.createElement('div');
    overlay.id = 'welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-box" role="dialog" aria-modal="true" aria-label="Welcome">
        <img src="/static/assets/welcome_animation.png" alt="Welcome" class="welcome-img" />
        <h2>Welcome to Bhajrang Fitness SRB</h2>
        <p>Train • Transform • Conquer</p>
        <button id="welcome-close" aria-label="Enter">Enter</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('welcome-close').addEventListener('click', function(){
      const el = document.getElementById('welcome-overlay');
      if(el){ el.style.display='none'; }
      sessionStorage.setItem('welcome_shown','1');
    });
  });
})();
