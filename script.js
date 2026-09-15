const needleContainer = document.getElementById("needleContainer");
const needle = document.getElementById("needle");
const targetArea = document.getElementById("targetArea");
const board = document.querySelector(".board");
const toggleButton = document.getElementById("toggleButton");
const nextRoundButton = document.getElementById("nextRoundButton");
const skipQuestionButton = document.getElementById("skipQuestionButton");
const newGameButton = document.getElementById("newGameButton");
const cluesElement = document.getElementById("clues");
const scoreElement = document.getElementById("score");
const totalScoreElement = document.getElementById("totalScore");
const turnIndicator = document.getElementById("turn-indicator");
const revealOverlay = document.getElementById("revealOverlay"); // New: Tap to Reveal Overlay
const psychicInfoBalloon = document.getElementById("psychic-info-balloon"); // New: Psychic Info Balloon

// Modal declarations - ensure modal is declared before its close button


const changeLogModal = document.getElementById("changeLogModal");
const changeLogCloseButton = changeLogModal.querySelector(".close-button");

let isDragging = false;
let targetAngle = 0;
let isTargetVisible = true;
let totalScore = 0;
let canMoveNeedle = false;
let isPostGuessPhase = false;

let clues;

const gameContainer = document.querySelector('.game-container');




let catalogVersion;
let gamePhase = "preparation";
let presentationId = null;
let lastRoundScore = null;
let gameReady = false;
let revealing = false;

function setGamePhase(phase) {
    gamePhase = phase;
    isTargetVisible = phase !== "guesser";
    isPostGuessPhase = phase === "postGuess";
    const scale = clues && clues[currentClueIndex];
    const context = { phase, presentationId, scaleId: scale?.id, catalogVersion };
    window.wavelengthFeedbackContext = context;
    document.getElementById("ratingCard").hidden = phase !== "psychic" || !scale;
    window.dispatchEvent(new CustomEvent("wavelength-phase", { detail: context }));
}

async function loadScales() {
    const response = await fetch("./escalas.json");
    if (!response.ok) throw new Error("Falha ao carregar escalas");
    const data = await response.json();
    const ids = new Set();
    if (typeof data.versao !== "string" || !Array.isArray(data.escalas) || !data.escalas.length) {
        throw new Error("Catálogo inválido");
    }
    for (const scale of data.escalas) {
        if (typeof scale.id !== "string" || !scale.id || ids.has(scale.id) ||
            typeof scale.extremo_esquerdo !== "string" || !scale.extremo_esquerdo.trim() ||
            typeof scale.extremo_direito !== "string" || !scale.extremo_direito.trim()) {
            throw new Error("Escala inválida ou ID duplicado");
        }
        ids.add(scale.id);
    }
    clues = data.escalas;
    catalogVersion = data.versao;
}

// Helper to update debug status on screen
const debugStatusDiv = document.getElementById('gemini-debug-status');
function updateDebugStatus(message) {
    if (debugStatusDiv) {
        debugStatusDiv.textContent = new Date().toLocaleTimeString() + " - " + message + "\n" + debugStatusDiv.textContent;
        // Keep only the last few messages to prevent overflow
        const messages = debugStatusDiv.textContent.split('\n').filter(Boolean);
        if (messages.length > 10) {
            debugStatusDiv.textContent = messages.slice(0, 10).join('\n');
        }
    }
}
// Initial status
updateDebugStatus("Script loaded, DOM elements selected and clues parsed.");

let teams = [];



let currentTeamIndex = 0;
let currentClueIndex = -1; // Initialize with an invalid index

// Define team-specific colors
const teamColors = [
    { primary: '#4f8cff', secondary: '#7aa7ff' },   // Blue
    { primary: '#ff6b9c', secondary: '#ff9ab8' },   // Pink
    { primary: '#5cb85c', secondary: '#8cd68c' },   // Green
    { primary: '#f0ad4e', secondary: '#f4c27a' },   // Orange
    { primary: '#5bc0de', secondary: '#8cdff4' }    // Cyan
];

// Reference to the new current team indicator pill
const currentTeamIndicator = document.getElementById("current-team-indicator");
const currentTeamIndicatorIcon = currentTeamIndicator.querySelector(".team-indicator__icon");
const currentTeamIndicatorLabel = currentTeamIndicator.querySelector(".team-indicator__label");
const currentTeamIndicatorName = currentTeamIndicator.querySelector(".team-indicator__name");

function updateCurrentTeamIndicator(phase) { // phase: "psychic", "guesser", "postGuess"
    if (teams.length === 0) {
        currentTeamIndicator.style.display = 'none';
        return;
    }
    currentTeamIndicator.style.display = 'flex'; // Show the indicator

    const team = teams[currentTeamIndex];
    const teamColorClass = `team-color-${currentTeamIndex % teamColors.length}`;

    // Clear previous team color classes
    currentTeamIndicator.className = 'team-indicator';
    currentTeamIndicator.classList.add(teamColorClass);

    // Apply CSS variables for dynamic glow
    currentTeamIndicator.style.setProperty('--team-color-current-primary', teamColors[currentTeamIndex % teamColors.length].primary);

    currentTeamIndicatorName.textContent = team.name;

    if (phase === "psychic") {
        currentTeamIndicatorIcon.textContent = '🔮'; // Psychic icon
        currentTeamIndicatorLabel.textContent = 'Psychic Turn';
        turnIndicator.textContent = "YOU ARE THE PSYCHIC"; // Set main turn indicator
    } else if (phase === "guesser") {
        currentTeamIndicatorIcon.textContent = '🤔'; // Guesser icon
        currentTeamIndicatorLabel.textContent = 'Now Guessing';
        turnIndicator.textContent = `You are now guessing for ${team.name}!`; // More descriptive for guesser
    } else if (phase === "postGuess") {
        currentTeamIndicatorIcon.textContent = '🏆'; // Award icon
        currentTeamIndicatorLabel.textContent = 'Points Awarded';
        turnIndicator.textContent = `Points awarded to ${team.name}! Nicely played!`; // Descriptive for post-guess
    }
}

function updateScoreDisplay() {
    let scoreHTML = `<div class="team-management-instructions">Click a team name to edit, or use buttons below.</div>`;
    scoreHTML += teams.map((team, index) =>
        `<div class="team-score-item ${index === currentTeamIndex ? 'current-team' : ''}" data-team-index="${index}">
            <span class="team-name-display">${team.name}<span class="edit-icon">✏️</span></span> ⭐ ${team.score}
            <button class="delete-team-button" data-team-index="${index}" ${teams.length === 1 ? 'disabled' : ''}>🗑️</button>
        </div>`
    ).join('');
    scoreHTML += `<button id="addTeamButton">Add Team</button>`;
    totalScoreElement.innerHTML = scoreHTML;

    // Attach event listeners using delegation for dynamically created elements
    totalScoreElement.querySelectorAll('.team-name-display').forEach(nameSpan => {
        nameSpan.addEventListener('click', (event) => {
            const index = parseInt(event.target.closest('.team-score-item').dataset.teamIndex);
            const currentName = teams[index].name;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'team-name-input-inline';
            event.target.replaceWith(input);
            input.focus();

            const handleNameChange = () => {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    teams[index].name = newName;
                    saveGameState();
                }
                updateScoreDisplay(); // Re-render to show updated name or revert if empty
            };

            input.addEventListener('blur', handleNameChange);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleNameChange();
                }
            });
        });
    });

    totalScoreElement.querySelectorAll('.delete-team-button').forEach(deleteButton => {
        deleteButton.addEventListener('click', (event) => {
            const indexToDelete = parseInt(event.target.dataset.teamIndex);
            if (teams.length > 1) { // Ensure at least one team remains
                teams.splice(indexToDelete, 1);
                if (currentTeamIndex >= teams.length) {
                    currentTeamIndex = 0; // Adjust currentTeamIndex if the current team was deleted or was the last one
                }
                saveGameState();
                updateScoreDisplay();
            }
        });
    });

    const addTeamButton = document.getElementById('addTeamButton');
    if (addTeamButton) {
        addTeamButton.addEventListener('click', () => {
            console.log("IN add team")
            const newTeamNumber = teams.length + 1;
            teams.push({ name: `Team ${newTeamNumber}`, score: 0 });
            saveGameState();
            updateScoreDisplay();
        });
    }
}

function saveGameState() {
    const gameState = {
        schemaVersion: 2, catalogVersion, teams, currentTeamIndex,
        scaleId: clues?.[currentClueIndex]?.id || null,
        presentationId, phase: gamePhase, targetAngle, currentNeedleAngle, lastRoundScore
    };
    try { localStorage.setItem('wavelengthGameState', JSON.stringify(gameState)); }
    catch (error) { console.warn("Não foi possível salvar a partida neste navegador", error); }
}

function loadGameState() {
    try {
        const state = JSON.parse(localStorage.getItem('wavelengthGameState'));
        if (!state || !Array.isArray(state.teams) || !state.teams.length ||
            !state.teams.every(team => typeof team.name === "string" && Number.isFinite(team.score))) return null;
        teams = state.teams;
        currentTeamIndex = Number.isInteger(state.currentTeamIndex) && state.currentTeamIndex >= 0 &&
            state.currentTeamIndex < teams.length ? state.currentTeamIndex : 0;
        currentClueIndex = clues.findIndex(scale => scale.id === state.scaleId);
        const validPhase = ["preparation", "psychic", "guesser", "postGuess"].includes(state.phase);
        if (state.schemaVersion !== 2 || !validPhase || currentClueIndex < 0 ||
            typeof state.presentationId !== "string" || !Number.isFinite(state.targetAngle) ||
            state.targetAngle < -90 || state.targetAngle > 90) {
            currentClueIndex = -1;
            gamePhase = "preparation";
            presentationId = null;
            targetAngle = 0;
            lastRoundScore = null;
        } else {
            gamePhase = state.phase;
            presentationId = state.presentationId;
            targetAngle = state.targetAngle;
            currentNeedleAngle = Number.isFinite(state.currentNeedleAngle) ?
                Math.max(-90, Math.min(90, state.currentNeedleAngle)) : 0;
            lastRoundScore = [0, 1, 3, 5].includes(state.lastRoundScore) ? state.lastRoundScore : null;
        }
        return state;
    } catch (error) {
        console.warn("Partida salva inválida", error);
        return null;
    }
}

// New function to completely reset the game
function resetGame() {
    presentationId = null;
    currentNeedleAngle = 0;
    lastRoundScore = null;
    teams.forEach(team => team.score = 0); // Reset scores only, preserve team names and count
    currentTeamIndex = 0; // Reset current team to the first team
    currentClueIndex = -1;
    targetAngle = 0;
    isPostGuessPhase = false;
    isTargetVisible = true; // Psychic's view is visible, but hidden by overlay

    updateScoreDisplay();
    scoreElement.textContent = "";
    showRevealOverlay();
    saveGameState();
    updateCurrentTeamIndicator("psychic"); // Update team indicator after reset
}



newGameButton.addEventListener("click", () => {

    if (gameReady && !revealing) resetGame(); // Start a new game
});

skipQuestionButton.addEventListener("click", () => {
    if (!gameReady || gamePhase !== "psychic") return;
    scoreElement.textContent = "";
    currentClueIndex = -1; // Reset to get a new random clue next time
    setPsychicView();
    saveGameState(); // Added this line
    updateCurrentTeamIndicator("psychic"); // Update the "Now Playing" pill for psychic turn
});

nextRoundButton.addEventListener("click", () => {
    if (!gameReady || gamePhase !== "postGuess") return;
    currentTeamIndex = (currentTeamIndex + 1) % teams.length;
    updateScoreDisplay();
    scoreElement.textContent = "";
    currentClueIndex = -1; // Reset to get a new random clue next time
    setPsychicView();
    saveGameState(); // Added this line
    // currentClueIndex = -1; // Removed redundant assignment
    updateCurrentTeamIndicator("psychic");
});

toggleButton.addEventListener("click", () => {
    if (!gameReady || !["psychic", "guesser"].includes(gamePhase)) return;
    isTargetVisible = !isTargetVisible;
    if (isTargetVisible) {
        // This is the "Reveal Target" action
        const needleAngle = parseFloat(needle.style.transform.replace("rotate(", "").replace("deg)", "")) || 0;
        const score = calculateScore(needleAngle);
        lastRoundScore = score;
        teams[currentTeamIndex].score += score;
        showPointsAnimation(score); // Call the new points animation function
        scoreElement.textContent = `${teams[currentTeamIndex].name} scored ${score} points!`; // Explicit message
        updateScoreDisplay();
        if (score === 5) { // Confetti for bull's eye
            triggerConfetti();
        } else if (score === 0) { // Shake animation for 0 points
            scoreElement.classList.add('shake-zero-points');
            setTimeout(() => {
                scoreElement.classList.remove('shake-zero-points');
            }, 500); // Animation duration is 0.5s
        }
        
        targetArea.style.display = "block";
        toggleButton.style.display = "none";
        skipQuestionButton.style.display = "none";
        nextRoundButton.style.display = "inline-block";
        turnIndicator.textContent = "Nicely played! Next round awaits!"; // More fun message
        setGamePhase("postGuess"); // Keep feedback hidden after reveal
        saveGameState(); // Save state after score update
        updateCurrentTeamIndicator("postGuess"); // Update the "Now Playing" pill for post-guess phase
        canMoveNeedle = false;

    } else {
        // This is the "Hide Target" action
        setGuesserView();
        saveGameState(); // Persist the isTargetVisible = false state
    }
});

// New: Function to show the "Tap to Reveal" overlay and hide game elements
function showRevealOverlay() {
    setGamePhase("preparation");
    revealOverlay.style.display = 'flex'; // Ensure display is not 'none' for transition
    revealOverlay.classList.add('active');
    board.classList.add('highlight');
    // Hide game elements that should be covered/reset
    targetArea.style.display = "none";
    document.getElementById("leftClue").textContent = ""; // Clear clues
    document.getElementById("rightClue").textContent = "";
    toggleButton.style.display = "none";
    skipQuestionButton.style.display = "none";
    nextRoundButton.style.display = "none";
    scoreElement.textContent = "";
    turnIndicator.textContent = "New Round Ready!";
    gameContainer.classList.remove('psychic-turn');
    hideNeedle();
    canMoveNeedle = false;
    psychicInfoBalloon.style.display = "none"; // Hide info balloon
    saveGameState(); // Save state with overlay active
}

// New: Event listener for the "Tap to Reveal" overlay
revealOverlay.addEventListener("click", () => {
    if (!gameReady || revealing || gamePhase !== "preparation") return;
    revealing = true;
    revealOverlay.classList.remove('active'); // Start fade out
    board.classList.remove('highlight');
    setTimeout(() => {
        revealOverlay.style.display = 'none'; // Hide completely after transition
        setPsychicView(); // Transition to psychic view
        revealing = false;
    }, 500); // Match CSS transition duration
});




// Hide game container initially
// gameContainer.style.display = 'none'; // Removed - now managed by initializeGame()

// Function to reconstruct UI based on loaded game state
function reconstructGameUI() {
    if (gamePhase === "preparation") {
        showRevealOverlay();
        updateCurrentTeamIndicator("psychic");
        return;
    }
    revealOverlay.classList.remove("active");
    revealOverlay.style.display = "none";
    displayClueForIndex(currentClueIndex);
    setTargetArea();
    updateNeedlePosition();
    if (gamePhase === "psychic") setPsychicView();
    else if (gamePhase === "guesser") setGuesserView();
    else {
        setGamePhase("postGuess");
        targetArea.style.display = "block";
        toggleButton.style.display = "none";
        skipQuestionButton.style.display = "none";
        nextRoundButton.style.display = "inline-block";
        gameContainer.classList.remove("psychic-turn");
        psychicInfoBalloon.style.display = "none";
        showNeedle();
        canMoveNeedle = false;
        updateCurrentTeamIndicator("postGuess");
        scoreElement.textContent = lastRoundScore === null ? "Rodada concluída" :
            `${teams[currentTeamIndex].name} scored ${lastRoundScore} points!`;
    }
}

async function initializeGame() {
    const status = document.getElementById("catalogStatus");
    const retry = document.getElementById("retryCatalog");
    retry.hidden = true;
    status.textContent = "Carregando escalas…";
    newGameButton.disabled = true;
    try {
        await loadScales();
        const loadedState = loadGameState();
        gameReady = true;
        status.hidden = true;
        newGameButton.disabled = false;
        if (!loadedState) {
            teams = [{ name: "Team 1", score: 0 }, { name: "Team 2", score: 0 }];
            currentTeamIndex = 0;
            resetGame();
        } else {
            updateScoreDisplay();
            reconstructGameUI();
            saveGameState();
        }
    } catch (error) {
        console.error(error);
        gameReady = false;
        status.hidden = false;
        status.textContent = "Não foi possível carregar as escalas.";
        retry.hidden = false;
    }
}

document.getElementById("retryCatalog").addEventListener("click", initializeGame);

document.addEventListener("DOMContentLoaded", () => {
    // MODAL AND BUTTON INITIALIZATION MOVED HERE
    const modal = document.getElementById("howToPlayModal");
    const howToPlayButton = document.getElementById("howToPlayButton");
    const closeButton = modal.querySelector(".close-button");

    const changeLogModal = document.getElementById("changeLogModal");
    const changeLogCloseButton = changeLogModal.querySelector(".close-button");

    changeLogCloseButton.onclick = function () {
        changeLogModal.classList.remove("show");
        setTimeout(() => changeLogModal.style.display = "none", 300);
    };

    howToPlayButton.onclick = function () {
        modal.style.display = "block";
        setTimeout(() => modal.classList.add("show"), 10);
    };

    closeButton.onclick = function () {
        modal.classList.remove("show");
        setTimeout(() => modal.style.display = "none", 300);
    };

    window.onclick = function (event) {

        if (event.target == changeLogModal) {
            changeLogModal.classList.remove("show");
            setTimeout(() => changeLogModal.style.display = "none", 300);
        }
    }

    // Mouse events
    board.addEventListener("mousedown", handleStart);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);

    // Touch events
    board.addEventListener("touchstart", handleStart);
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    initializeGame(); // This was already here
});


function setPsychicView() {
    canMoveNeedle = false;
    isPostGuessPhase = false; // Ensure this is false for a new psychic round
    
    if (currentClueIndex === -1) { // Only generate new if not reconstructing from saved state
        initializeNewTargetArea();
        setRandomClues();
    } else {
        // If reconstructing, ensure UI reflects current global targetAngle and currentClueIndex
        setTargetArea(); // Re-apply target area based on global targetAngle
        displayClueForIndex(currentClueIndex); // Re-display clues based on global currentClueIndex
    }
    
    setGamePhase("psychic");
    saveGameState(); // Save state after setting the clue
    updateCurrentTeamIndicator("psychic"); // Update the "Now Playing" pill for psychic turn
    
    gameContainer.classList.add('psychic-turn');
    turnIndicator.textContent = "YOU ARE THE PSYCHIC";
    psychicInfoBalloon.style.display = "block"; // Show info balloon for psychic

    targetArea.style.display = "block";
    toggleButton.textContent = "Hide for Guessers";
    toggleButton.style.display = "inline-block";
    skipQuestionButton.style.display = "inline-block";
    nextRoundButton.style.display = "none";
    
    needle.style.transform = "rotate(0deg)";
    hideNeedle();
}

function setGuesserView() {
    setGamePhase("guesser");
    canMoveNeedle = true;
    isPostGuessPhase = false; // Ensure this is false for the guesser phase
    
    gameContainer.classList.remove('psychic-turn');
    turnIndicator.textContent = "GUESS THE WAVELENGTH!";
    psychicInfoBalloon.style.display = "none"; // Hide info balloon for guesser

    targetArea.style.display = "none";
    toggleButton.textContent = "Reveal Target";
    scoreElement.textContent = "";
    showNeedle();
    updateCurrentTeamIndicator("guesser"); // Update the "Now Playing" pill for guesser turn
    skipQuestionButton.style.display = "none";
    nextRoundButton.style.display = "none";
}


// Helper function to clamp angles for the gradient
function clampAngle(angle) {
    return Math.max(0, Math.min(180, angle));
}

function setTargetArea() {
    const angle1 = clampAngle(targetAngle - 22.5 + 90);
    const angle2 = clampAngle(targetAngle - 13.5 + 90);
    const angle3 = clampAngle(targetAngle - 4.5 + 90);
    const angle4 = clampAngle(targetAngle + 4.5 + 90);
    const angle5 = clampAngle(targetAngle + 13.5 + 90);
    const angle6 = clampAngle(targetAngle + 22.5 + 90);

    const gradient = `conic-gradient(
                from -90deg at 50% 100%,
                #a4b0be 0deg ${angle1}deg,
                #ff6b6b ${angle1}deg ${angle2}deg,
                #feca57 ${angle2}deg ${angle3}deg,
                #48dbfb ${angle3}deg ${angle4}deg,
                #feca57 ${angle4}deg ${angle5}deg,
                #ff6b6b ${angle5}deg ${angle6}deg,
                #a4b0be ${angle6}deg 180deg
            )`;
    targetArea.style.background = gradient;
}

function initializeNewTargetArea() {
    targetAngle = Math.random() * 180 - 90;
    setTargetArea();
}

function setRandomClues() {
    if (!clues || clues.length === 0) return;
    presentationId = crypto.randomUUID();
    currentNeedleAngle = 0;
    lastRoundScore = null;
    currentClueIndex = Math.floor(Math.random() * clues.length); // Assign to global variable
    displayClueForIndex(currentClueIndex);
}

function displayClueForIndex(index) {
    if (!clues || clues.length === 0 || index < 0 || index >= clues.length) return;
    const { extremo_esquerdo: left, extremo_direito: right } = clues[index];
    document.getElementById("leftClue").textContent = left;
    document.getElementById("rightClue").textContent = right;
}

function calculateScore(angle) {
    const diff = Math.abs(angle - targetAngle);
    if (diff <= 4.5) return 5;
    if (diff <= 13.5) return 3;
    if (diff <= 22.5) return 1;
    return 0;
}

function handleStart(e) {
    if (!canMoveNeedle) return;
    isDragging = true;
    e.preventDefault(); // Prevent default touch behavior
}

function triggerConfetti() {
    confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#ff0000', '#00ff00', '#0000ff'], // Custom colors
        ticks: 200, // How long the animation lasts
        shapes: ['square'], // Use only square confetti
        gravity: 0.8, // Slightly increase gravity
        scalar: 1.2 // Make the confetti a bit larger
    });
}

function showPointsAnimation(score) {
    if (score === 0) return; // No animation for 0 points

    const boardRect = board.getBoundingClientRect(); // Get the semi-circle's position relative to viewport
    const gameContainerRect = gameContainer.getBoundingClientRect(); // Get gameContainer's position relative to viewport

    const numberOfPopups = score * 3; // More popups for higher scores, e.g., 5 points = 15 popups

    for (let i = 0; i < numberOfPopups; i++) {
        const scorePopup = document.createElement('div');
        scorePopup.textContent = `+${score}`;
        scorePopup.classList.add('score-popup');

        // Randomize initial position within the board's area, emanating roughly from its top half
        // Positions are relative to gameContainer's top-left corner
        const randomLeft = Math.random() * (boardRect.width * 0.8) + (boardRect.width * 0.1); // 10%-90% of board width
        const randomTop = Math.random() * (boardRect.height * 0.7); // Top 70% of the board height

        scorePopup.style.left = `${boardRect.left - gameContainerRect.left + randomLeft}px`;
        scorePopup.style.top = `${boardRect.top - gameContainerRect.top + randomTop}px`;

        // Apply random delay for a staggered effect
        scorePopup.style.animationDelay = `${Math.random() * 0.8}s`; // 0 to 0.8 seconds delay

        gameContainer.appendChild(scorePopup);

        scorePopup.addEventListener('animationend', () => {
            scorePopup.remove();
        });
    }
}

let currentNeedleAngle = 0; // New global variable to store the needle's current angle

// ... (rest of the file) ...

function handleMove(e) {
    if (!isDragging || !canMoveNeedle) return;
    e.preventDefault(); // Prevent default touch behavior
    const rect = needleContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.bottom;

    let clientX, clientY;
    if (e.type === "touchmove") {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const angle =
        (Math.atan2(clientX - centerX, centerY - clientY) * 180) / Math.PI;
    const clampedAngle = Math.max(-90, Math.min(90, angle));
    currentNeedleAngle = clampedAngle; // Update global angle variable
    requestAnimationFrame(updateNeedlePosition); // Request animation frame for smooth update
}

function updateNeedlePosition() {
    needle.style.transform = `rotate(${currentNeedleAngle}deg)`;
}

function handleEnd() {
    if (isDragging) saveGameState();
    isDragging = false;
}

function hideNeedle() {
    needle.style.display = "none";
}

function showNeedle() {
    needle.style.display = "block";
}
