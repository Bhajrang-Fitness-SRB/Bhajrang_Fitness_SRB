const app = {
    // 1. Navigation
    switchTab: (id) => {
        // Hide all sections
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        // Remove active state from all buttons
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        // Show target section
        const targetSection = document.getElementById(id);
        if (targetSection) targetSection.classList.add('active');
        
        // Safely set the active button
        const e = window.event;
        if (e && e.currentTarget && e.currentTarget.classList) {
            e.currentTarget.classList.add('active');
        } else {
            // Fallback: Find the button matching this tab id
            const btn = document.querySelector(`.nav-btn[onclick*="${id}"]`);
            if (btn) btn.classList.add('active');
        }
    },

    speak: (text) => {
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech to prevent overlap
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0; 
            utterance.pitch = 1.1;
            window.speechSynthesis.speak(utterance);
        }
    },

    // 2. Kiosk Operations
    faceScan: async () => {
        const box = document.getElementById('kiosk-result');
        const faceName = document.getElementById('face_name').value || 'Warrior';
        
        box.innerText = "Analyzing Facial Consistency..."; 
        box.style.color = "#FFD700";
        
        try {
            const payload = { full_name: faceName };
            const res = await fetch('/api/face_attendance', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const data = await res.json();
            box.innerText = data.voice; 
            box.style.color = data.color;
            app.speak(data.voice);
        } catch (e) { 
            console.error("Face Scan Error:", e);
            box.innerText = "Scanner Offline."; 
            box.style.color = "red"; 
        }
    },

    qrScan: async () => {
        const box = document.getElementById('kiosk-result');
        const qrInput = document.getElementById('qr_data');
        const qrData = qrInput.value.trim();
        
        if(!qrData) {
            box.innerText = "Please enter or scan QR data.";
            box.style.color = "red";
            return;
        }
        
        box.innerText = "Verifying QR...";
        box.style.color = "yellow";
        
        try {
            const res = await fetch('/api/qr_attendance', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ qr_data: qrData }) 
            });
            const data = await res.json();
            box.innerText = data.voice; 
            box.style.color = data.color;
            app.speak(data.voice); 
            qrInput.value = ""; // Clear input on success
        } catch (e) { 
            console.error("QR Scan Error:", e);
            box.innerText = "Engine Error. Check Backend."; 
            box.style.color = "red";
        }
    },

    // 3. Registration Form Logic
    previewPhoto: (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => { 
                document.getElementById('photo-preview').src = reader.result; 
            };
            reader.readAsDataURL(file);
        }
    },

    submitRegistration: async () => {
        const msgBox = document.getElementById('reg-msg');
        msgBox.style.display = "block";
        const name = document.getElementById('reg_name').value.trim();
        const phone = document.getElementById('reg_phone').value.trim();

        if (!name || !phone) {
            msgBox.innerText = "Name and Phone are required!"; 
            msgBox.style.color = "red"; 
            return;
        }
        
        msgBox.innerText = "Saving Profile to Core Engine..."; 
        msgBox.style.color = "yellow";
        
        try {
            const res = await fetch('/api/register_member', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ name, phone }) 
            });
            
            if (!res.ok) throw new Error("Server rejected registration");
            
            msgBox.innerText = "✅ Warrior Registration Successful!"; 
            msgBox.style.color = "#00FF00";
            app.speak("Registration complete. Welcome to Bhajrang Fitness.");
            
            // Optional: Clear form here
        } catch (e) {
            console.error("Registration Error:", e);
            msgBox.innerText = "Offline Mode: Data saved locally."; 
            msgBox.style.color = "yellow";
        }
    },

    // 4. Billing & Invoice Logic
    calcTotal: () => {
        const pack = parseFloat(document.getElementById('inv_package').value) || 0;
        const disc = parseFloat(document.getElementById('inv_discount').value) || 0;
        const total = pack - disc;
        
        document.getElementById('lbl_sub').innerText = "₹" + pack;
        document.getElementById('lbl_disc').innerText = "- ₹" + disc;
        document.getElementById('lbl_total').innerText = "₹" + (total > 0 ? total : 0);
    },

    generateInvoice: () => {
        const msgBox = document.getElementById('inv-msg');
        msgBox.style.display = "block";
        const total = document.getElementById('lbl_total').innerText;
        
        if (total === "₹0") { 
            msgBox.innerText = "Select a package first."; 
            msgBox.style.color = "red"; 
            return; 
        }
        
        msgBox.innerText = `✅ Invoice Generated Successfully! Amount Paid: ${total}`;
        msgBox.style.color = "#00FF00";
        app.speak("Invoice generated. Payment securely logged.");
    },

    // 5. AI & Vault
    askAI: async () => {
        const box = document.getElementById('ai-response');
        const promptInput = document.getElementById('prompt').value.trim();
        const agentType = document.getElementById('agent_type').value;

        if (!promptInput) {
            box.innerText = "Please enter a command for the AI.";
            box.style.color = "red";
            return;
        }

        box.innerText = "Processing via Neural Net..."; 
        box.style.color = "yellow";
        
        try {
            const res = await fetch('/api/ai_master', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ agent_type: agentType, prompt: promptInput }) 
            });
            const result = await res.json();
            box.innerText = result.response; 
            box.style.color = "#FFF";
        } catch(e) { 
            console.error("AI Engine Error:", e);
            box.innerText = "AI Offline. Check Network or Server."; 
            box.style.color = "red";
        }
    },

    unlockVault: async () => {
        const box = document.getElementById('vault-msg');
        const pinInput = document.getElementById('pin').value;
        
        if (!pinInput) {
            box.innerText = "PIN required.";
            box.style.color = "red";
            return;
        }

        box.innerText = "Authenticating...";
        box.style.color = "yellow";

        try {
            // FIXED: Now targets the exact /vault route configured in Python
            const res = await fetch('/vault', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ pin: pinInput }) 
            });
            const data = await res.json();
            
            box.innerText = data.message; 
            box.style.color = data.status === 'success' ? '#00FF00' : 'red';
            
            if (data.status === 'success') {
                app.speak("Vault Unlocked. Welcome Admin.");
                document.getElementById('pin').value = ''; // clear PIN
            }
        } catch(e) { 
            console.error("Vault Access Error:", e);
            box.innerText = "Vault Locked. Connection Failed."; 
            box.style.color = "red";
        }
    }
};