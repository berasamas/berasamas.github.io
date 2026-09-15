// The game and local voting work even when the Firebase SDK cannot be loaded.
const config = {
    apiKey: "AIzaSyB-1uJAX0u_QoXFs8a7IKZzDL60nSo9YIY",
    authDomain: "berafeedback-55c5d.firebaseapp.com",
    projectId: "berafeedback-55c5d",
    storageBucket: "berafeedback-55c5d.firebasestorage.app",
    messagingSenderId: "485710405311",
    appId: "1:485710405311:web:dd530b71a5ad48426eb00a"
};
const STORAGE_KEY = "wavelengthFeedbackV1";
const card = document.getElementById("ratingCard");
const status = document.getElementById("ratingStatus");
const retry = document.getElementById("retryFeedback");
let context = window.wavelengthFeedbackContext;
let entries = {};
let storageAvailable = true;
let clientPromise;
let syncing = false;
let blocked = false;
let retryTimer;
let currentSaveId = null;
let lastError = null;

try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const [id, entry] of Object.entries(stored)) {
        if (/^[a-f0-9-]{36}$/.test(id) && entry && typeof entry.scaleId === "string" &&
            typeof entry.catalogVersion === "string" &&
            [null, 1, 2, 3].includes(entry.difficulty) && [null, 1, 2, 3].includes(entry.fun)) {
            entries[id] = entry;
        }
    }
} catch (error) { console.warn("Feedback local indisponível", error); }

function persist() {
    // Keep all pending votes and a bounded history of acknowledged presentations.
    const saved = Object.keys(entries).filter(id => !entries[id].pending);
    for (const id of saved.slice(0, Math.max(0, saved.length - 100))) delete entries[id];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        storageAvailable = true;
    } catch (error) {
        storageAvailable = false;
        console.warn("Não foi possível guardar feedback neste navegador", error);
    }
}

function render() {
    const entry = entries[context?.presentationId];
    for (const button of card.querySelectorAll(".vote-chip")) {
        button.setAttribute("aria-pressed", String(entry?.[button.dataset.criterion] === Number(button.dataset.value)));
    }
    retry.hidden = !entry?.pending || (!lastError && navigator.onLine);
    if (!entry) status.textContent = "Opcional · avalie quando quiser.";
    else if (!entry.pending) status.textContent = "Avaliação salva. Obrigado!";
    else if (lastError?.includes("permission-denied")) status.textContent = "O Firebase recusou o envio. A avaliação está pendente.";
    else if (!storageAvailable) status.textContent = "Pendente · mantenha esta página aberta para salvar.";
    else if (!navigator.onLine || lastError) status.textContent = "Pendente de conexão · tentaremos novamente.";
    else status.textContent = currentSaveId === context.presentationId ? "Salvando…" : "Avaliação pendente de envio.";
}

async function getClient() {
    if (!clientPromise) {
        clientPromise = (async () => {
            const base = "https://www.gstatic.com/firebasejs/12.3.0/";
            const [appSDK, authSDK, dbSDK] = await Promise.all([
                import(base + "firebase-app.js"),
                import(base + "firebase-auth.js"),
                import(base + "firebase-firestore.js")
            ]);
            const app = appSDK.initializeApp(config);
            const auth = authSDK.getAuth(app);
            await auth.authStateReady();
            if (!auth.currentUser) await authSDK.signInAnonymously(auth);
            return { uid: auth.currentUser.uid, db: dbSDK.getFirestore(app), ...dbSDK };
        })().catch(error => { clientPromise = null; throw error; });
    }
    return clientPromise;
}

function scheduleSync() {
    clearTimeout(retryTimer);
    if (navigator.onLine && !blocked) retryTimer = setTimeout(sync, lastError ? 15000 : 0);
}

async function sync() {
    if (syncing || blocked || !navigator.onLine || !Object.values(entries).some(entry => entry.pending)) {
        render();
        return;
    }
    syncing = true;
    try {
        const client = await getClient();
        lastError = null;
        for (const [id, entry] of Object.entries(entries)) {
            if (!entry.pending) continue;
            currentSaveId = id;
            const snapshot = { ...entry };
            render();
            const pendingHint = setTimeout(() => { lastError = "connection-timeout"; render(); }, 8000);
            try {
                // Fixed document path: retries and revised choices overwrite the same evaluation.
                await client.setDoc(client.doc(client.db, "feedback", client.uid, "ratings", id), {
                    scaleId: snapshot.scaleId,
                    catalogVersion: snapshot.catalogVersion,
                    difficulty: snapshot.difficulty,
                    fun: snapshot.fun,
                    updatedAt: client.serverTimestamp()
                });
            } finally { clearTimeout(pendingHint); }
            lastError = null;
            if (entries[id]?.revision === snapshot.revision) entries[id].pending = false;
            persist();
        }
    } catch (error) {
        lastError = String(error.code || error.message);
        blocked = /permission-denied|operation-not-allowed|unauthorized-domain|invalid-api-key/.test(lastError);
        console.error("Falha ao salvar avaliação", error);
    } finally {
        syncing = false;
        currentSaveId = null;
        render();
        if (Object.values(entries).some(entry => entry.pending)) scheduleSync();
    }
}

card.addEventListener("click", event => {
    const button = event.target.closest(".vote-chip");
    if (!button || context?.phase !== "psychic" || !context.scaleId || !context.presentationId) return;
    const id = context.presentationId;
    const entry = entries[id] || {
        scaleId: context.scaleId, catalogVersion: context.catalogVersion,
        difficulty: null, fun: null, revision: 0, pending: false
    };
    const criterion = button.dataset.criterion;
    const value = Number(button.dataset.value);
    if (entry[criterion] === value) return;
    entry[criterion] = value;
    entry.revision += 1;
    entry.pending = true;
    entries[id] = entry;
    persist();
    render();
    sync();
});

window.addEventListener("wavelength-phase", event => { context = event.detail; render(); });
window.addEventListener("online", () => { blocked = false; lastError = null; sync(); });
window.addEventListener("offline", render);
retry.addEventListener("click", () => { blocked = false; lastError = null; sync(); });
render();
sync();
