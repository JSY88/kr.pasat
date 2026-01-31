// Howler.js audio system variables
let howlReady = false;
let numberSounds = {};
let audioInitialized = false;
let activeAudioContext = null;



// State tracking variables for answer handling
let lastPresentedNumber = null;  // The most recently presented number
let currentNumber = null;        // Current number being played
let correctAnswer = null;        // Current correct answer
let currentIntervalId = null;    // Current interval timer
let audioPlayInProgress = false; // Flag for audio playing
let processingAnswer = false;    // Flag for answer processing
let nextPresentationTime = 0;    // When the next number should be presented
let forcePresentNextNumber = false; // Flag to force next number presentation
let useNumberPad = false;
let answerProcessed = false;     // Track if current answer has been processed

// N-back variables
let nbackValue = 1;              // Current N-back setting (1-back, 2-back, etc.)
let numberSequence = [];         // Array to store the sequence of numbers for N-back calculations

let currentTrialId = 0;         // Track which trial we're currently on
let nextNumberScheduled = false; // Track if next number has been scheduled

// Training state
let trainingTimerId = null;
let currentISIValue = 3000;
let consecutiveCorrect = 0;
let consecutiveIncorrect = 0;
let sessionHistory = [];
let totalCorrect = 0;
let totalAttempts = 0;
let lowestISI = 3000;
let remainingTime = 20 * 60; // in seconds
let sessionActive = false; // Track if training session is active

// Beep system is now HTML5-based, no AudioContext initialization needed

// Improved initialization for Howler with better error handling
function initializeHowlerAudio() {
  // Define the number files
  const numberFiles = {
    1: 'audio/one.wav',
    2: 'audio/two.wav',
    3: 'audio/three.wav',
    4: 'audio/four.wav',
    5: 'audio/five.wav',
    6: 'audio/six.wav',
    7: 'audio/seven.wav',
    8: 'audio/eight.wav',
    9: 'audio/nine.wav'
  };
  
  // Track loaded sounds
  let loadedCount = 0;
  const totalSounds = Object.keys(numberFiles).length;
  

  
  // Create Howls for each number
  for (let i = 1; i <= 9; i++) {
    numberSounds[i] = new Howl({
      src: [numberFiles[i]],
      preload: true,
      html5: false, // Use Web Audio API for more reliable playback
      onload: function() {
        loadedCount++;
        
        if (loadedCount === totalSounds) {
          howlReady = true;
        }
      },
      onloaderror: function(id, err) {
        console.error(`Error loading audio file for number ${i}:`, err);
      }
    });
    
    // Force the howl to preload with more reliable cache loading
    numberSounds[i].load();
  }
}

// Simplified Howler playback
function playNumberWithHowler(number) {
  return new Promise((resolve) => {
    if (audioPlayInProgress) {
      // Don't play if audio is already playing
      resolve();
      return;
    }
    
    // Check if audio system is ready
    if (!howlReady) {
      resolve();
      return;
    }
    
    audioPlayInProgress = true;
    
    if (!numberSounds[number]) {
      audioPlayInProgress = false;
      resolve();
      return;
    }
    
    // Set volume to default (1.0)
    numberSounds[number].volume(1.0);
    
    // Apply playback rate from settings
    numberSounds[number].rate(audioSpeedSettings.rate);
    
    // Keep track of whether we've resolved
    let hasResolved = false;
    
    // Calculate dynamic audio window based on playback rate
    // Base audio duration is ~500ms, so adjust window accordingly
    const baseAudioDuration = 500; // Base audio duration in ms
    const dynamicAudioWindow = Math.ceil(baseAudioDuration / audioSpeedSettings.rate);
    
    // Safety timeout based on dynamic audio window
    const safetyTimeout = setTimeout(() => {
      resolveOnce();
    }, dynamicAudioWindow + 100); // Add 100ms buffer
    
    // Function to resolve only once
    function resolveOnce() {
      if (!hasResolved) {
        hasResolved = true;
        audioPlayInProgress = false;
        clearTimeout(safetyTimeout); // Clear timeout to prevent double resolution
        resolve();
      }
    }
    
    // Register the end event BEFORE playing
    numberSounds[number].once('end', resolveOnce);
    
    // Start playback with error handling
    try {
      const soundId = numberSounds[number].play();
      
      if (soundId === null) {
        clearTimeout(safetyTimeout);
        resolveOnce();
      }
    } catch (e) {
      clearTimeout(safetyTimeout);
      resolveOnce();
    }
  });
}

// Simplified speak function
function speakNumber(number) {
  // Don't speak if session is not active
  if (!sessionActive) {
    return Promise.resolve();
  }
  return playNumberWithHowler(number);
}



// Stop all audio playback
function stopAllAudio() {
  // Stop all Howler sounds
  Object.values(numberSounds).forEach(sound => {
    if (sound.playing()) {
      sound.stop();
    }
  });
  
  // Stop beep sound if playing
  if (beepSound && beepSound.playing()) {
    beepSound.stop();
  }
  
  // Stop any speech synthesis
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  
  // Reset audio state
  audioPlayInProgress = false;
}

// Beep system using pre-recorded beep.wav file
let beepSound = null;

// Initialize beep audio system
function initializeBeepAudio() {
  beepSound = new Howl({
    src: ['audio/beep.wav'],
    preload: true,
    html5: true, // Use HTML5 for better compatibility
    volume: beepSettings.volume
  });
}

// Play error beep sound using the pre-recorded beep.wav file
// This function is completely non-blocking and won't interfere with trial timing
function playErrorBeep() {
  if (!beepSettings.enabled || beepSettings.volume <= 0) {
    return;
  }
  
  // Play beep asynchronously without blocking the main flow
  setTimeout(() => {
    try {
      if (beepSound && beepSound.state() === 'loaded') {
        // Set volume dynamically based on current settings
        beepSound.volume(beepSettings.volume);
        
        // Play the beep
        beepSound.play();
      } else {
        // Fallback to HTML5 Audio if Howler fails
        const beepAudio = new Audio('audio/beep.wav');
        beepAudio.volume = beepSettings.volume;
        
        beepAudio.play().catch(error => {
          console.error('Error playing beep sound:', error);
        });
        
        // Clean up the audio element after playback
        beepAudio.onended = () => {
          beepAudio.remove();
        };
        
        // Fallback cleanup in case onended doesn't fire
        setTimeout(() => {
          if (beepAudio.src) {
            beepAudio.remove();
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error playing beep sound:', error);
    }
  }, 0);
}



// UI Elements - will be initialized in DOMContentLoaded
let descriptionScreen, trainingScreen, resultsScreen;
let startTraining, endTraining, startNewTraining;
let standardMode, customMode, modeDescription, customModeControls;
let durationSlider, durationValue;
let statusMessage, answerInput, currentISI, timerCircle, minutesLeft, secondsLeft;
let correctCount, totalCount, accuracyRate, minISI, historyContainer;
let useNumberPadToggle, numberpad, numberpadButtons;
// audioStatus is now declared at the top and initialized in initializeHowlerAudio

// Global variables for UI elements

// DOM validation will be moved to DOMContentLoaded

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Helper function to check if button clicks can be processed
function canProcessButtonClick() {
  if (processingAnswer) {
    return false;
  }
  if (correctAnswer === null) {
    return false;
  }
  if (audioPlayInProgress) {
    return false;
  }
  if (answerProcessed) {
    return false;
  }
  // All conditions passed
  return true;
}

// Helper function to check if a specific answer is correct and can be processed immediately
function canProcessAnswerImmediately(userAnswer) {
  if (!canProcessButtonClick()) {
    return false;
  }
  
  // Only process immediately if the answer is correct
  return userAnswer === correctAnswer;
}

// Helper function to check if we should process an answer immediately (for numberpad)
function shouldProcessAnswerImmediately(userAnswer) {
  // For numberpad, only process immediately if correct
  // For text input, this is handled separately in the input handlers
  return canProcessAnswerImmediately(userAnswer);
}

  // Mode switching
  let isStandardMode = true;
  let isCustomMode = false;
  let isManualMode = false;
  
  // Mode-specific settings
  let standardModeSettings = {
    selectedISI: 3000,
    sessionDuration: 20
  };
  
  let manualModeSettings = {
    selectedISI: 3000,
    sessionDuration: 20
  };
  
  // Current active settings (will be set based on selected mode)
  let selectedISI = 3000;
  let sessionDuration = 20;

// Event listeners will be initialized in DOMContentLoaded

// Button handlers and other event listeners will be initialized in DOMContentLoaded

// Update consecutive counter display
function updateConsecutiveCounter() {
  const dots = document.querySelectorAll('.counter-dot');
  
  // Reset all dots
  dots.forEach(dot => {
    dot.classList.remove('correct');
    dot.classList.remove('incorrect');
  });
  
  // Update based on consecutive correct or incorrect
  if (consecutiveCorrect > 0) {
    for (let i = 0; i < Math.min(consecutiveCorrect, 4); i++) {
      dots[i].classList.add('correct');
    }
  } else if (consecutiveIncorrect > 0) {
    for (let i = 0; i < Math.min(consecutiveIncorrect, 4); i++) {
      dots[i].classList.add('incorrect');
    }
  }
}

// Generate a random number between 1-9
function generateNumber() {
  return Math.floor(Math.random() * 9) + 1;
}

// Calculate correct answer based on N-back value
function calculateNbackAnswer(currentNum, sequence, nback) {
  if (sequence.length < nback) {
    return null; // Not enough numbers in sequence yet
  }
  
  const previousNum = sequence[sequence.length - nback - 1];
  return currentNum + previousNum;
}

// Start session - simplified
function startSession() {
  
  // Auto-initialize audio if not tested yet (more user-friendly)
  if (!audioInitialized) {
    audioInitialized = true;
  }
  
  // Beep system is now HTML5-based, no initialization needed
  
  // Reset all audio
  stopAllAudio();
  
  if (useNumberPad) {
    answerInput.style.display = 'none';
    numberpad.style.display = 'grid';
    // Reset all number pad buttons completely
    numberpadButtons.forEach(btn => {
      btn.classList.remove('selected');
      btn.classList.remove('incorrect-selection');
    });
    // Apply current size setting
    updateNumberpadSize();
  } else {
    answerInput.style.display = 'block';
    numberpad.style.display = 'none';
    answerInput.value = '';
    answerInput.style.borderColor = '';
    answerInput.focus();
  }
  
  // Switch screens
  descriptionScreen.style.display = 'none';
  trainingScreen.style.display = 'block';
  resultsScreen.style.display = 'none';
  
  // Initialize session variables - comprehensive reset
  selectedISI = Math.max(500, selectedISI); // Ensure minimum 500ms
  currentISIValue = selectedISI;
  currentISI.textContent = currentISIValue;
  consecutiveCorrect = 0;
  consecutiveIncorrect = 0;
  remainingTime = sessionDuration * 60;
  sessionHistory = [];
  totalCorrect = 0;
  totalAttempts = 0;
  
  // Get current N-back value
  const nbackInput = document.getElementById('nbackValue');
  if (nbackInput) {
    nbackValue = Math.max(1, Math.min(10, parseInt(nbackInput.value) || 1));
    nbackInput.value = nbackValue; // Ensure value is within bounds
  }
  
  // Initialize N-back sequence
  numberSequence = [];
  
  // In manual mode, keep ISI constant; in other modes, track lowest ISI
  if (isManualMode) {
    lowestISI = currentISIValue; // Keep it constant
  } else {
    lowestISI = currentISIValue; // Allow it to change
  }
  currentNumber = null;
  correctAnswer = null;
  lastPresentedNumber = null;
  processingAnswer = false;
  nextPresentationTime = 0;
  forcePresentNextNumber = false;
  answerProcessed = false;
  currentTrialId = 0;
  nextNumberScheduled = false;
  audioPlayInProgress = false; // Reset audio state
  
  // Clear any existing timeouts
  if (currentIntervalId) {
    clearTimeout(currentIntervalId);
    currentIntervalId = null;
  }
  
  // Reset UI states
  numberpadButtons.forEach(btn => {
    btn.classList.remove('selected');
    btn.classList.remove('incorrect-selection');
  });
  // Reset the counter dots display
  updateConsecutiveCounter();
  
  // Update timer display
  updateTimerDisplay();
  
  // Clear status message (will be hidden in CSS)
  statusMessage.textContent = "";
  statusMessage.style.color = '';
  
  // Reset input field
  answerInput.value = '';
  answerInput.style.borderColor = '';
  answerInput.focus();
  
  // Start the timer
  trainingTimerId = setInterval(updateTimer, 1000);
  
  // Mark session as active
  sessionActive = true;
  
  // Start presenting numbers after short delay
  setTimeout(() => {
    presentNextNumber();
  }, 1000);
}

// Present next number with timeout handling for incorrect answers
async function presentNextNumber() {
  // Don't present numbers if session is not active
  if (!sessionActive) {
    return;
  }
  
  if (nextNumberScheduled) {
    return;
  }
  
  // Set flag to prevent multiple calls
  nextNumberScheduled = true;
  
  // Clear any existing interval
  if (currentIntervalId) {
    clearTimeout(currentIntervalId);
    currentIntervalId = null;
  }

  // Important: Store current time to enforce timing consistency
  const currentTime = Date.now();
  
  // Only enforce timing if we're not the first number and not forced to present next
  if (numberSequence.length > 0 && !forcePresentNextNumber) {
    // Calculate how much time remains before next presentation should occur
    const timeUntilNextPresentation = nextPresentationTime - currentTime;
    
    // If we still have time to wait, schedule and return
    if (timeUntilNextPresentation > 0) {
      // Clear any existing timeout before setting new one
      if (currentIntervalId) {
        clearTimeout(currentIntervalId);
        currentIntervalId = null;
      }
      currentIntervalId = setTimeout(() => {
        presentNextNumber();
      }, timeUntilNextPresentation);
      // Keep flag set until timeout completes to prevent multiple calls
      return;
    }
  }
  
  // Reset forced presentation flag
  forcePresentNextNumber = false;
  
  // Generate a new number
  currentNumber = generateNumber();
  
  // Add current number to sequence
  numberSequence.push(currentNumber);
  
  // Calculate correct answer for the new round using N-back logic
  // For N-back, we need N+1 numbers before we can ask the first question
  if (numberSequence.length >= nbackValue + 1) {
    correctAnswer = calculateNbackAnswer(currentNumber, numberSequence, nbackValue);
    currentTrialId++; // Increment trial ID for new trial

    // Create and push the trial object immediately
    const currentTrial = {
      nbackValue: nbackValue,
      currentNumber: currentNumber,
      previousNumber: numberSequence[numberSequence.length - nbackValue - 1], // The number N positions back
      correctAnswer: correctAnswer,
      userAnswer: null,
      correct: null,
      isi: currentISIValue,
      trialId: currentTrialId // Add trial ID to trial object
    };
    sessionHistory.push(currentTrial);
  }
  
  // Let the system know we're presenting a new number
  lastPresentedNumber = currentNumber;
  
  // Reset flags in safe order: nextNumberScheduled first, then answer processing flags
  nextNumberScheduled = false;
  
  // Now it's safe to reset answer processing flags for new trial
  if (correctAnswer !== null) {
    answerProcessed = false;
    processingAnswer = false;
  }
  
  // Clear input field 
  if (useNumberPad) {
    // Don't clear button selections here - let the timeout or correct answer processing handle it
    // This allows the timeout to find the selected button for wrong answers
  } else {
    answerInput.value = '';
    answerInput.focus();
  }
  
  try {
    // Speak the number
    await speakNumber(currentNumber);
    
    // After speaking, schedule next number
    if (numberSequence.length >= nbackValue + 1) {
      // Set the next presentation time based on current time + ISI
      nextPresentationTime = Date.now() + currentISIValue;
      
      // Schedule next number immediately (same as else branch)
      currentIntervalId = setTimeout(() => {
        presentNextNumber();
      }, currentISIValue);
      
      // Separately, set timeout to process answer if it hasn't been processed yet
      const trialId = currentTrialId; // Capture the current trial ID
      const trialPresentationTime = Date.now(); // Capture when this number was presented (audio just finished)
      setTimeout(() => {
        // Only process if answer hasn't been processed yet and we're not currently processing
        if (!answerProcessed && !processingAnswer) {
          // Find the trial by trialId to ensure we're processing the correct trial
          const targetTrial = sessionHistory.find(t => t.trialId === trialId);
          if (!targetTrial || targetTrial.userAnswer !== null) {
            return; // Trial already answered or doesn't exist
          }
          const lastTrialIndex = sessionHistory.length - 1;
          const targetTrialIndex = sessionHistory.findIndex(t => t.trialId === trialId);
          
          // If target trial is not the last one, we need to handle it specially
          // (This can happen if the next number was already presented)
          if (targetTrialIndex !== lastTrialIndex) {
            // The next number was already presented, so we need to process the old trial directly
            // Don't use processAnswer since it will use the wrong trial
            // IMPORTANT: Don't modify answerProcessed flag - it's for the current trial, not this old one
            
            // Get the answer (this might be from the old trial's input, which may have been cleared)
            let finalAnswer = null;
            // Note: The input field may have been cleared for the new trial, so we might not find an answer
            // This is expected - the user didn't answer in time for the old trial
            
            const userAnswer = null; // Always treat as no answer since we're past the deadline
            
            // Calculate response time (from when number was presented to when answer was processed)
            const responseTime = Date.now() - trialPresentationTime;
            targetTrial.responseTime = responseTime;
            targetTrial.userAnswer = userAnswer;
            
            // Check if correct (always false since userAnswer is null - no answer provided)
            targetTrial.correct = false;
            
            // Update counters
            totalAttempts++;
            consecutiveCorrect = 0;
            consecutiveIncorrect++;
            
            // Update ISI based on performance (only if NOT in manual mode)
            if (!isManualMode) {
              const minISI = 500;
              if (consecutiveIncorrect >= 4) {
                currentISIValue = Math.min(5000, currentISIValue + 100);
                currentISI.textContent = currentISIValue;
                consecutiveIncorrect = 0;
              }
            }
            
            // Update display
            updateConsecutiveCounter();
            
            // Play error beep if enabled
            playErrorBeep();
            
            // Don't modify answerProcessed or correctAnswer - they're for the current trial
            // Don't clear input field - it's for the current trial
          } else {
            // Target trial is the last one, so we can use processAnswer normally
            // correctAnswer should already be correct (it's for the current trial)
            // Don't modify it - just use processAnswer directly
            
            // Don't set flags here - let processAnswer() manage its own flags
            let finalAnswer = null;
            
            if (useNumberPad) {
              // Check if any button is selected
              const selectedButton = document.querySelector('.numberpad-button.selected');
              if (selectedButton) {
                finalAnswer = parseInt(selectedButton.getAttribute('data-value'));
              }
            } else {
              // Get answer from text input
              const inputValue = answerInput.value.trim();
              if (inputValue) {
                finalAnswer = Number(inputValue);
              }
            }
            
            // Process the final answer using centralized function
            let userAnswer = null;
            if (finalAnswer !== null && !isNaN(finalAnswer)) {
              userAnswer = Number(finalAnswer);
            }
            
            // Use centralized processAnswer function
            // Mark as processed before calling to prevent other handlers from firing
            answerProcessed = true;
            
            let success = false;
            if (userAnswer !== null) {
              success = processAnswer(userAnswer);
            } else {
              // No answer provided - treat as incorrect (null means no answer)
              success = processAnswer(null);
            }
            
            // If processAnswer failed, reset the flag
            if (!success) {
              answerProcessed = false;
            }
            
            // Clear input field after timeout processing for next round
            if (useNumberPad) {
              numberpadButtons.forEach(btn => btn.classList.remove('selected'));
            } else {
              answerInput.value = '';
              answerInput.focus(); // Ensure input field gets focus for next round
            }
          }
        }
      }, currentISIValue);
    } else {
      // Not enough numbers in sequence yet, just schedule next
      nextPresentationTime = Date.now() + currentISIValue;
      
      currentIntervalId = setTimeout(() => {
        presentNextNumber();
      }, currentISIValue);
    }
    
  } catch (error) {
    // Reset flag on error and recover
    nextNumberScheduled = false;
    setTimeout(() => {
      // Additional safety checks before recovery
      if (!nextNumberScheduled && !processingAnswer) {
        presentNextNumber();
      }
    }, 1000);
  }
  

}

// Process answer - centralized function for handling all answer processing
function processAnswer(userAnswer) {
  
  if (processingAnswer || correctAnswer === null) {
    return false;
  }

  processingAnswer = true;

  // Get the current trial
  const currentTrial = sessionHistory[sessionHistory.length - 1];
  if (!currentTrial) {
    processingAnswer = false;
    return false;
  }

  // Validate trial hasn't already been answered
  if (currentTrial.userAnswer !== null) {
    processingAnswer = false;
    // Don't reset answerProcessed here - the trial is actually complete
    return false;
  }

  // Validate trial belongs to current number sequence
  if (currentTrial.correctAnswer !== correctAnswer) {
    processingAnswer = false;
    // This is a serious error - don't reset answerProcessed to prevent further processing
    return false;
  }

  // Calculate response time (from when number was presented to when answer was processed)
  const responseTime = Date.now() - (nextPresentationTime - currentISIValue);
  currentTrial.responseTime = responseTime;
  
  // Update trial with answer
  currentTrial.userAnswer = userAnswer;
  // Robust comparison that properly handles null values
  let isCorrect = false;
  if (userAnswer !== null && userAnswer !== undefined) {
    const numericAnswer = Number(userAnswer);
    const numericCorrect = Number(currentTrial.correctAnswer);
    // Only correct if both are valid numbers and equal
    isCorrect = !isNaN(numericAnswer) && !isNaN(numericCorrect) && numericAnswer === numericCorrect;
  }
  // If userAnswer is null/undefined, it's always incorrect
  currentTrial.correct = isCorrect;

  // Update counters (centralized logic)
  totalAttempts++;
  if (isCorrect) {
    totalCorrect++;
    consecutiveCorrect++;
    consecutiveIncorrect = 0;
  } else {
    consecutiveCorrect = 0;
    consecutiveIncorrect++;
  }

  // Update ISI based on performance (only if NOT in manual mode)
  if (!isManualMode) {
    // Minimum ISI should account for potential audio duration plus buffer
    const minISI = 500; // 500ms minimum for audio + response timing
    
    if (consecutiveCorrect >= 4) {
      currentISIValue = Math.max(minISI, currentISIValue - 100);
      currentISI.textContent = currentISIValue;
      lowestISI = Math.min(lowestISI, currentISIValue);
      consecutiveCorrect = 0;
    } else if (consecutiveIncorrect >= 4) {
      currentISIValue = Math.min(5000, currentISIValue + 100);
      currentISI.textContent = currentISIValue;
      consecutiveIncorrect = 0;
    }
  } else {
    // In manual mode, ensure ISI stays constant at selected value
    currentISIValue = selectedISI;
    currentISI.textContent = currentISIValue;
  }
  
  // Update display
  updateConsecutiveCounter();
  
  // Clear input for next number
  if (useNumberPad) {
    // Only clear selected buttons for correct answers (incorrect answers handle their own cleanup)
    if (isCorrect) {
      numberpadButtons.forEach(btn => btn.classList.remove('selected'));
    }
  } else {
    // Only clear text input for correct answers, allow retry for wrong answers
    if (isCorrect) {
      answerInput.value = '';
    } else {
      // For wrong answers, keep focus on input field so user can retry
      answerInput.focus();
    }
  }
  
  // Play error beep if enabled - do this AFTER all timing calculations
  // to ensure it doesn't interfere with trial timing
  if (!isCorrect) {
    playErrorBeep();
  }
  
  // Don't clear the timeout here - let it handle the next number scheduling
  // This ensures consistent flow whether answer is processed immediately or by timeout
  
  // Reset processing flag to allow future processing
  processingAnswer = false;
  return true;
}

// Update the timer every second
function updateTimer() {
  remainingTime--;
  updateTimerDisplay();
  
  if (remainingTime <= 0) {
    endSession();
  }
}

// Update the timer display
function updateTimerDisplay() {
  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;
  
  minutesLeft.textContent = minutes.toString().padStart(2, '0');
  secondsLeft.textContent = seconds.toString().padStart(2, '0');
  
  // Update timer circle
  const progress = (sessionDuration * 60 - remainingTime) / (sessionDuration * 60) * 100;
  timerCircle.style.background = `conic-gradient(var(--primary) 0% ${progress}%, var(--border-light) ${progress}% 100%)`;
}

// Pause functionality removed - no more pausing in the game

// End session function
function endSession() {
  // Stop all audio
  stopAllAudio();
  
  // Beep system cleanup handled in stopAllAudio()
  
  // Clear timers
  clearInterval(trainingTimerId);
  
  if (currentIntervalId) {
    clearTimeout(currentIntervalId);
    currentIntervalId = null;
  }
  
  // Reset state completely for clean session end
  sessionActive = false;
  processingAnswer = false;
  answerProcessed = false;
  nextNumberScheduled = false;
  audioPlayInProgress = false;
  forcePresentNextNumber = false;
  
  // Show results screen
  trainingScreen.style.display = 'none';
  resultsScreen.style.display = 'block';
  
  // Update stats
  correctCount.textContent = totalCorrect;
  totalCount.textContent = totalAttempts;
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  accuracyRate.textContent = `${accuracy}%`;
  minISI.textContent = lowestISI;
  
  // Add session to progress history
  addSessionToHistory();
  
  // Update cumulative stats display
  updateCumulativeStats();
}

// Update numberpad button sizes
function updateNumberpadSize() {
  const size = getComputedStyle(document.documentElement).getPropertyValue('--numberpad-button-size');
  const scale = parseFloat(size) || 1;
  
  // Update button transforms
  numberpadButtons.forEach(btn => {
    btn.style.transform = `scale(${scale})`;
  });
  
  // Update grid gap to prevent overlap
  const numberpad = document.getElementById('numberpad');
  if (numberpad) {
    const baseGap = 6; // 0.375rem = 6px
    const buttonSize = 56; // 3.5rem = 56px base button size
    const scaledButtonSize = buttonSize * scale;
    
    // Calculate minimum gap to prevent overlap
    // More aggressive gap scaling to ensure plenty of spacing
    const gapPercentage = scale > 1.5 ? 0.6 : scale > 1.0 ? 0.45 : 0.3;
    const minGap = Math.max(baseGap, Math.round(scaledButtonSize * gapPercentage));
    numberpad.style.gap = `${minGap}px`;
    
    // Adjust container padding to accommodate larger buttons
    // More aggressive padding for larger sizes to prevent edge overlap
    const basePadding = 16;
    const paddingMultiplier = scale > 1.5 ? 2.0 : scale > 1.0 ? 1.5 : 1.2;
    const containerPadding = Math.max(basePadding, Math.round(basePadding * paddingMultiplier));
    numberpad.style.padding = `${containerPadding}px`;
  }
}

// Update the history display
function updateHistory() {
  historyContainer.innerHTML = '';
  
  // Group history into blocks of 10 trials
  const blocks = [];
  for (let i = 0; i < sessionHistory.length; i += 10) {
    blocks.push(sessionHistory.slice(i, i + 10));
  }
  
  // Create a summary for each block
  blocks.forEach((block, index) => {
    const startTrial = index * 10 + 1;
    const endTrial = startTrial + block.length - 1;
    
    const correctInBlock = block.filter(trial => trial.correct).length;
    const totalInBlock = block.length;
    const accuracyInBlock = totalInBlock > 0 ? Math.round((correctInBlock / totalInBlock) * 100) : 0;
    
    // Find lowest ISI in this block
    const lowestBlockISI = Math.min(...block.map(trial => trial.isi));
    
    const blockItem = document.createElement('div');
    blockItem.className = `history-item ${accuracyInBlock >= 70 ? 'correct' : 'incorrect'} animate-slide-up`;
    blockItem.style.animationDelay = `${index * 0.1}s`;
    
    // Create DOM elements safely without innerHTML for better security
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center mb-2';
    
    const trialsSpan = document.createElement('span');
    trialsSpan.className = 'font-semibold';
    trialsSpan.textContent = `Trials ${startTrial}-${endTrial}`;
    
    const accuracySpan = document.createElement('span');
    accuracySpan.className = accuracyInBlock >= 70 ? 'badge badge-success' : 'badge badge-danger';
    accuracySpan.textContent = `${accuracyInBlock}% Accuracy`;
    
    headerDiv.appendChild(trialsSpan);
    headerDiv.appendChild(accuracySpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'grid grid-cols-2 gap-4 mt-2';
    
    const correctDiv = document.createElement('div');
    const correctLabel = document.createElement('div');
    correctLabel.className = 'text-muted';
    correctLabel.style.fontSize = '0.75rem';
    correctLabel.textContent = 'Correct Answers';
    const correctValue = document.createElement('div');
    correctValue.className = 'font-semibold';
    correctValue.textContent = `${correctInBlock}/${totalInBlock}`;
    correctDiv.appendChild(correctLabel);
    correctDiv.appendChild(correctValue);
    
    const isiDiv = document.createElement('div');
    const isiLabel = document.createElement('div');
    isiLabel.className = 'text-muted';
    isiLabel.style.fontSize = '0.75rem';
    isiLabel.textContent = 'Lowest Interval';
    const isiValue = document.createElement('div');
    isiValue.className = 'font-semibold';
    isiValue.textContent = `${lowestBlockISI}ms`;
    isiDiv.appendChild(isiLabel);
    isiDiv.appendChild(isiValue);
    
    contentDiv.appendChild(correctDiv);
    contentDiv.appendChild(isiDiv);
    
    blockItem.appendChild(headerDiv);
    blockItem.appendChild(contentDiv);
    
    historyContainer.appendChild(blockItem);
  });
}

// Progress tracking and data persistence
let allSessions = [];

// Custom mode settings persistence
let customModeSettings = {
  selectedISI: 3000,
  sessionDuration: 20
};

// N-back settings persistence
let nbackSettings = {
  value: 1
};

// Beep settings persistence
let beepSettings = {
  enabled: false,
  volume: 0.5
};

// Audio speed settings persistence
let audioSpeedSettings = {
  rate: 1.0
};

// Load saved sessions from localStorage
function loadSessions() {
  try {
    const saved = localStorage.getItem('pasatSessions');
    if (saved) {
      allSessions = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
    allSessions = [];
  }
}

// Save sessions to localStorage
function saveSessions() {
  try {
    localStorage.setItem('pasatSessions', JSON.stringify(allSessions));
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

// Load custom mode settings from localStorage
function loadCustomModeSettings() {
  try {
    const saved = localStorage.getItem('pasatCustomModeSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      customModeSettings.selectedISI = settings.selectedISI || 3000;
      customModeSettings.sessionDuration = settings.sessionDuration || 20;
      
      // Update UI to reflect loaded settings
      updateCustomModeUI();
    }
  } catch (error) {
    console.error('Error loading custom mode settings:', error);
  }
}

// Load manual mode settings from localStorage
function loadManualModeSettings() {
  try {
    const saved = localStorage.getItem('pasatManualModeSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      manualModeSettings.selectedISI = settings.selectedISI || 3000;
      manualModeSettings.sessionDuration = settings.sessionDuration || 20;
    }
  } catch (error) {
    console.error('Error loading manual mode settings:', error);
  }
}

// Load N-back settings from localStorage
function loadNbackSettings() {
  try {
    const saved = localStorage.getItem('pasatNbackSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      nbackSettings.value = Math.max(1, Math.min(10, settings.value || 1));
    }
  } catch (error) {
    console.error('Error loading N-back settings:', error);
  }
}

// Load beep settings from localStorage
function loadBeepSettings() {
  try {
    const saved = localStorage.getItem('pasatBeepSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      beepSettings.enabled = settings.enabled || false;
      beepSettings.volume = Math.max(0, Math.min(1, settings.volume || 0.5));
      
      // Update UI to reflect loaded settings
      updateBeepUI();
      
      // Update beep sound volume if already initialized
      if (beepSound) {
        beepSound.volume(beepSettings.volume);
      }
    }
  } catch (error) {
    console.error('Error loading beep settings:', error);
  }
}

// Save N-back settings to localStorage
function saveNbackSettings() {
  try {
    localStorage.setItem('pasatNbackSettings', JSON.stringify(nbackSettings));
  } catch (error) {
    console.error('Error saving N-back settings:', error);
  }
}

// Save custom mode settings to localStorage
function saveCustomModeSettings() {
  try {
    localStorage.setItem('pasatCustomModeSettings', JSON.stringify(customModeSettings));
  } catch (error) {
    console.error('Error saving custom mode settings:', error);
  }
}

// Save beep settings to localStorage
function saveBeepSettings() {
  try {
    localStorage.setItem('pasatBeepSettings', JSON.stringify(beepSettings));
  } catch (error) {
    console.error('Error saving beep settings:', error);
  }
}

// Theme management functions
function loadThemePreference() {
  try {
    const savedTheme = localStorage.getItem('pasatTheme');
    if (savedTheme === 'alternative') {
      document.documentElement.setAttribute('data-theme', 'alternative');
      updateThemeToggleIcon('alternative');
    } else if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      updateThemeToggleIcon('dark');
    } else {
      // Default theme
      document.documentElement.removeAttribute('data-theme');
      updateThemeToggleIcon('default');
    }
  } catch (error) {
    console.error('Error loading theme preference:', error);
  }
}

function saveThemePreference(theme) {
  try {
    localStorage.setItem('pasatTheme', theme);
  } catch (error) {
    console.error('Error saving theme preference:', error);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  let newTheme;
  
  // Cycle through themes: default -> alternative -> dark -> default
  if (!currentTheme || currentTheme === 'default') {
    newTheme = 'alternative';
    document.documentElement.setAttribute('data-theme', 'alternative');
  } else if (currentTheme === 'alternative') {
    newTheme = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // currentTheme === 'dark'
    newTheme = 'default';
    document.documentElement.removeAttribute('data-theme');
  }
  
  updateThemeToggleIcon(newTheme);
  saveThemePreference(newTheme);
}

function updateThemeToggleIcon(theme) {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    const themeIcon = themeToggle.querySelector('.theme-icon');
    if (themeIcon) {
      if (theme === 'alternative') {
        // Show sun icon for alternative theme (to switch to dark)
        themeIcon.innerHTML = `
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2"/>
          <path d="M12 21v2"/>
          <path d="M4.22 4.22l1.42 1.42"/>
          <path d="M18.36 18.36l1.42 1.42"/>
          <path d="M1 12h2"/>
          <path d="M21 12h2"/>
          <path d="M4.22 19.78l1.42-1.42"/>
          <path d="M18.36 5.64l1.42-1.42"/>
        `;
      } else if (theme === 'dark') {
        // Show moon icon for dark theme (to switch back to default)
        themeIcon.innerHTML = `
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
          <path d="M19 3v4"/>
          <path d="M21 5h-4"/>
        `;
      } else {
        // Default theme - show sun icon (to switch to alternative)
        themeIcon.innerHTML = `
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2"/>
          <path d="M12 21v2"/>
          <path d="M4.22 4.22l1.42 1.42"/>
          <path d="M18.36 18.36l1.42 1.42"/>
          <path d="M1 12h2"/>
          <path d="M21 12h2"/>
          <path d="M4.22 19.78l1.42-1.42"/>
          <path d="M18.36 5.64l1.42-1.42"/>
        `;
      }
    }
  }
}

// Update custom mode UI to reflect current settings
function updateCustomModeUI() {
  // Update ISI button selection
  const isiButtons = document.querySelectorAll('.isi-button');
  isiButtons.forEach(btn => {
    const isiValue = parseInt(btn.getAttribute('data-isi'));
    if (isiValue === customModeSettings.selectedISI) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update duration slider
  const durationSlider = document.getElementById('durationSlider');
  const durationValue = document.getElementById('durationValue');
  if (durationSlider && durationValue) {
    durationSlider.value = customModeSettings.sessionDuration;
    durationValue.textContent = customModeSettings.sessionDuration;
  }
  
  // Update manual mode duration slider if it exists
  const manualDurationSlider = document.getElementById('manualDurationSlider');
  const manualDurationValue = document.getElementById('manualDurationValue');
  if (manualDurationSlider && manualDurationValue) {
    manualDurationSlider.value = customModeSettings.sessionDuration;
    manualDurationValue.textContent = customModeSettings.sessionDuration;
  }
  
  // Update global variables
  selectedISI = customModeSettings.selectedISI;
  sessionDuration = customModeSettings.sessionDuration;
}

// Update standard mode UI to reflect current settings
function updateStandardModeUI() {
  // Standard mode always uses fixed settings
  selectedISI = standardModeSettings.selectedISI;
  sessionDuration = standardModeSettings.sessionDuration;
  
  // Ensure standard mode always uses the correct default values
  if (selectedISI !== 3000) {
    selectedISI = 3000;
    standardModeSettings.selectedISI = 3000;
  }
  if (sessionDuration !== 20) {
    sessionDuration = 20;
    standardModeSettings.sessionDuration = 20;
  }
}

// Update manual mode UI
function updateManualModeUI() {
  // Update ISI buttons
  const isiButtons = document.querySelectorAll('.isi-button');
  isiButtons.forEach(btn => {
    const isiValue = parseInt(btn.dataset.isi);
    if (isiValue === manualModeSettings.selectedISI) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update duration slider
  const manualDurationSlider = document.getElementById('manualDurationSlider');
  const manualDurationValue = document.getElementById('manualDurationValue');
  if (manualDurationSlider && manualDurationValue) {
    manualDurationSlider.value = manualModeSettings.sessionDuration;
    manualDurationValue.textContent = manualModeSettings.sessionDuration;
  }
  
  // Update global variables
  selectedISI = manualModeSettings.selectedISI;
  sessionDuration = manualModeSettings.sessionDuration;
}

// Update beep UI
function updateBeepUI() {
  const useErrorBeep = document.getElementById('useErrorBeep');
  const beepVolumeControls = document.getElementById('beepVolumeControls');
  const beepVolumeSlider = document.getElementById('beepVolumeSlider');
  const beepVolumeValue = document.getElementById('beepVolumeValue');
  
  if (useErrorBeep) {
    useErrorBeep.checked = beepSettings.enabled;
    beepVolumeControls.style.display = beepSettings.enabled ? 'block' : 'none';
  }
  
  if (beepVolumeSlider && beepVolumeValue) {
    beepVolumeSlider.value = beepSettings.volume;
    
    // Update volume display text
    if (beepSettings.volume <= 0.3) {
      beepVolumeValue.textContent = 'Quiet';
    } else if (beepSettings.volume <= 0.7) {
      beepVolumeValue.textContent = 'Medium';
    } else {
      beepVolumeValue.textContent = 'Loud';
    }
  }
  
  // Update beep sound volume if initialized
  if (beepSound) {
    beepSound.volume(beepSettings.volume);
  }
}

// Update audio speed UI
function updateAudioSpeedUI() {
  const audioSpeedSlider = document.getElementById('audioSpeedSlider');
  const audioSpeedValue = document.getElementById('audioSpeedValue');
  
  if (audioSpeedSlider && audioSpeedValue) {
    audioSpeedSlider.value = audioSpeedSettings.rate;
    
    // Update speed display text
    if (audioSpeedSettings.rate === 1.0) {
      audioSpeedValue.textContent = 'Normal (1.0x)';
    } else {
      audioSpeedValue.textContent = `Fast (${audioSpeedSettings.rate.toFixed(1)}x)`;
    }
  }
}

// Add current session to history
function addSessionToHistory() {
  if (sessionHistory.length === 0) return;
  
  // Only record sessions with 50 or more questions answered
  if (totalAttempts < 50) return;
  
  const sessionData = {
    date: new Date().toISOString(),
    totalCorrect: totalCorrect,
    totalAttempts: totalAttempts,
    accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    sessionDuration: sessionDuration,
    lowestISI: lowestISI,
    mode: isStandardMode ? 'Standard' : isManualMode ? 'Manual' : 'Custom',
    nbackValue: nbackValue,
    trials: sessionHistory.length,
    averageResponseTime: calculateAverageResponseTime(),
    consecutiveCorrectMax: Math.max(...Array.from({length: sessionHistory.length}, (_, i) => {
      let count = 0;
      for (let j = i; j < sessionHistory.length && sessionHistory[j].correct; j++) {
        count++;
      }
      return count;
    }))
  };
  
  allSessions.push(sessionData);
  saveSessions();
}

// Calculate average response time from session history
function calculateAverageResponseTime() {
  const responseTimes = sessionHistory
    .filter(trial => trial.responseTime !== undefined)
    .map(trial => trial.responseTime);
  
  if (responseTimes.length === 0) return 0;
  return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
}

// Calculate training streaks and consistency
function calculateTrainingStreaks() {
  if (allSessions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalTrainingDays: 0,
      lastTrainingDate: null
    };
  }
  
  // Sort sessions by date (oldest first)
  const sortedSessions = [...allSessions].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate = null;
  let totalTrainingDays = 0;
  let lastTrainingDate = null;
  
  // Get unique training dates (sessions on the same day count as one day)
  const uniqueDates = [...new Set(sortedSessions.map(session => 
    new Date(session.date).toDateString()
  ))].sort();
  
  totalTrainingDays = uniqueDates.length;
  lastTrainingDate = uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : null;
  
  // Calculate streaks
  for (let i = 0; i < uniqueDates.length; i++) {
    const currentDate = new Date(uniqueDates[i]);
    
    if (lastDate === null) {
      // First training day
      tempStreak = 1;
    } else {
      const daysDiff = Math.floor((currentDate - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        // Consecutive day
        tempStreak++;
      } else {
        // Gap in training, reset streak
        tempStreak = 1;
      }
    }
    
    longestStreak = Math.max(longestStreak, tempStreak);
    lastDate = currentDate;
  }
  
  // Calculate current streak (from most recent date)
  if (uniqueDates.length > 0) {
    const today = new Date().toDateString();
    const mostRecentDate = new Date(uniqueDates[uniqueDates.length - 1]);
    const daysSinceLastTraining = Math.floor((new Date(today) - mostRecentDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastTraining === 0) {
      // Trained today, count backwards
      currentStreak = tempStreak;
    } else if (daysSinceLastTraining === 1) {
      // Trained yesterday, count backwards
      currentStreak = tempStreak;
    } else {
      // Gap in training, no current streak
      currentStreak = 0;
    }
  }
  
  return {
    currentStreak,
    longestStreak,
    totalTrainingDays,
    lastTrainingDate
  };
}

// Get weekly and monthly progress
function getWeeklyProgress() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return allSessions.filter(session => 
    new Date(session.date) > oneWeekAgo
  );
}

function getMonthlyProgress() {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return allSessions.filter(session => 
    new Date(session.date) > oneMonthAgo
  );
}

// Clear all progress data
function clearProgressData() {
  if (confirm('Are you sure you want to clear all progress data? This action cannot be undone.')) {
    allSessions = [];
    localStorage.removeItem('pasatSessions');
    updateProgressDisplay();
  }
}

// Format time in mm:ss format
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update progress display
function updateProgressDisplay() {
  if (allSessions.length === 0) {
    // Show no data message
    document.getElementById('totalSessions').textContent = '0';
    document.getElementById('totalQuestions').textContent = '0';
    document.getElementById('avgAccuracy').textContent = '0%';
    document.getElementById('recentSessionsList').innerHTML = '<p class="text-muted text-center py-8">No sessions completed yet. Complete your first training session to see progress!</p>';
    return;
  }
  
  // Get selected mode filter
  const modeFilter = document.getElementById('modeFilter');
  const selectedMode = modeFilter ? modeFilter.value : 'all';
  
  // Filter sessions to only include those with 50+ questions and selected mode
  let validSessions = allSessions.filter(session => session.totalAttempts >= 50);
  
  if (selectedMode !== 'all') {
    validSessions = validSessions.filter(session => session.mode === selectedMode);
  }
  
  if (validSessions.length === 0) {
    // Show no valid sessions message
    document.getElementById('totalSessions').textContent = '0';
    document.getElementById('totalQuestions').textContent = '0';
    document.getElementById('avgAccuracy').textContent = '0%';
    document.getElementById('recentSessionsList').innerHTML = '<p class="text-muted text-center py-8">No valid sessions found for the selected mode. Complete a session with at least 50 questions to see progress!</p>';
    return;
  }
  
  // Update summary stats using only valid sessions
  const totalSessions = validSessions.length;
  const totalQuestions = validSessions.reduce((sum, session) => sum + session.totalAttempts, 0);
  const avgAccuracy = totalQuestions > 0 ? Math.round(validSessions.reduce((sum, session) => sum + (session.accuracy * session.totalAttempts), 0) / totalQuestions) : 0;
  
  // Calculate additional stats using only valid sessions
  const avgResponseTime = validSessions.length > 0 ? Math.round(validSessions.reduce((sum, session) => sum + session.averageResponseTime, 0) / validSessions.length) : 0;
  const bestAccuracy = validSessions.length > 0 ? Math.max(...validSessions.map(session => session.accuracy)) : 0;
  const totalTime = validSessions.reduce((sum, session) => sum + session.sessionDuration, 0);
  const avgSessionTime = validSessions.length > 0 ? Math.round(totalTime / validSessions.length) : 0;
  
  document.getElementById('totalSessions').textContent = totalSessions;
  document.getElementById('totalQuestions').textContent = totalQuestions;
  document.getElementById('avgAccuracy').textContent = `${avgAccuracy}%`;
  
  // Update additional stats if elements exist
  const avgResponseElement = document.getElementById('avgResponseTime');
  if (avgResponseElement) avgResponseElement.textContent = `${avgResponseTime}ms`;
  
  const bestAccuracyElement = document.getElementById('bestAccuracy');
  if (bestAccuracyElement) bestAccuracyElement.textContent = `${bestAccuracy}%`;
  
  const totalTimeElement = document.getElementById('totalTime');
  if (totalTimeElement) totalTimeElement.textContent = formatTime(totalTime);
  
  const avgSessionTimeElement = document.getElementById('avgSessionTime');
  if (avgSessionTimeElement) avgSessionTimeElement.textContent = formatTime(avgSessionTime);
  
  // Update recent sessions list
  const recentSessionsList = document.getElementById('recentSessionsList');
  recentSessionsList.innerHTML = '';
  
  // Show last 10 valid sessions
  const recentSessions = validSessions.slice(-10).reverse();
  recentSessions.forEach(session => {
    const sessionItem = document.createElement('div');
    sessionItem.className = 'bg-gray-50 hover:bg-gray-100 p-4 rounded-lg border transition-colors';
    
    const date = new Date(session.date).toLocaleDateString();
    const time = new Date(session.date).toLocaleTimeString();
    
    sessionItem.innerHTML = `
      <div class="flex justify-between items-center">
        <div class="font-medium">${session.mode} Mode (${session.nbackValue || 1}-back)</div>
        <div class="text-gray-600">${date} at ${time}</div>
      </div>
      <div class="grid grid-cols-4 gap-4 mt-2 text-sm">
        <div>
          <div class="text-gray-500">Accuracy</div>
          <div class="font-semibold">${session.accuracy}%</div>
        </div>
        <div>
          <div class="text-gray-500">Questions</div>
          <div class="font-semibold">${session.totalAttempts}</div>
        </div>
        <div>
          <div class="text-gray-500">Lowest ISI</div>
          <div class="font-semibold">${session.lowestISI}ms</div>
        </div>
        <div>
          <div class="text-gray-500">Avg Response</div>
          <div class="font-semibold">${session.averageResponseTime}ms</div>
        </div>
      </div>
    `;
    
    recentSessionsList.appendChild(sessionItem);
  });
  
  // Create progress chart using Chart.js
  const progressChart = document.getElementById('progressChart');
  if (progressChart && validSessions.length > 0) {
    // Destroy existing chart if it exists
    if (window.progressChartInstance) {
      window.progressChartInstance.destroy();
    }
    
    // Prepare data for the chart
    const last10Sessions = validSessions.slice(-10);
    const labels = last10Sessions.map(session => {
      const date = new Date(session.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const accuracyData = last10Sessions.map(session => session.accuracy);
    const responseTimeData = last10Sessions.map(session => session.averageResponseTime);
    
    // Create new chart
    const ctx = progressChart.getContext('2d');
    window.progressChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Accuracy (%)',
            data: accuracyData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            yAxisID: 'y'
          },
          {
            label: 'Avg Response Time (ms)',
            data: responseTimeData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Accuracy (%)'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Avg Response Time (ms)'
            },
            min: 0,
            max: 1500,
            grid: {
              drawOnChartArea: false,
            },
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Performance Trends'
          },
          legend: {
            display: true
          }
        }
      }
    });
  }
}

// Update cumulative stats display
function updateCumulativeStats() {
  // Calculate cumulative stats from all sessions
  const totalSessions = allSessions.length;
  const totalQuestions = allSessions.reduce((sum, session) => sum + session.totalAttempts, 0);
  const totalCorrect = allSessions.reduce((sum, session) => sum + session.totalCorrect, 0);
  const cumulativeAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  
  // Find best session accuracy
  const bestSessionAccuracy = allSessions.length > 0 ? Math.max(...allSessions.map(session => session.accuracy)) : 0;
  
  // Calculate streaks
  const streakData = calculateTrainingStreaks();
  
  // Update cumulative stats elements
  const cumulativeSessions = document.getElementById('cumulativeSessions');
  const cumulativeQuestions = document.getElementById('cumulativeQuestions');
  const cumulativeAccuracyElement = document.getElementById('cumulativeAccuracy');
  const bestSessionAccuracyElement = document.getElementById('bestSessionAccuracy');
  const currentStreakElement = document.getElementById('currentStreak');
  const longestStreakElement = document.getElementById('longestStreak');
  const totalTrainingDaysElement = document.getElementById('totalTrainingDays');
  
  if (cumulativeSessions) cumulativeSessions.textContent = totalSessions;
  if (cumulativeQuestions) cumulativeQuestions.textContent = totalQuestions;
  if (cumulativeAccuracyElement) cumulativeAccuracyElement.textContent = `${cumulativeAccuracy}%`;
  if (bestSessionAccuracyElement) bestSessionAccuracyElement.textContent = `${bestSessionAccuracy}%`;
  if (currentStreakElement) currentStreakElement.innerHTML = `${streakData.currentStreak} <span class="stat-subtitle-left">days</span>`;
  if (longestStreakElement) longestStreakElement.innerHTML = `${streakData.longestStreak} <span class="stat-subtitle-left">days</span>`;
  if (totalTrainingDaysElement) totalTrainingDaysElement.innerHTML = `${streakData.totalTrainingDays} <span class="stat-subtitle-left">total</span>`;
}



// Event listeners will be initialized in DOMContentLoaded

// Initialize app
window.addEventListener('DOMContentLoaded', function() {
  // Load saved sessions
  loadSessions();
  
  // Load custom mode settings
  loadCustomModeSettings();
  
  // Load manual mode settings
  loadManualModeSettings();
  
  // Load N-back settings
  loadNbackSettings();
  
  // Load beep settings
  loadBeepSettings();
  
  // Load audio speed settings
  loadAudioSpeedSettings();
  
  // Load saved theme preference
  loadThemePreference();
  
  // Initialize numberpad size CSS custom property
  document.documentElement.style.setProperty('--numberpad-button-size', '1');
  
  // Initialize all DOM elements
  descriptionScreen = document.getElementById('descriptionScreen');
  trainingScreen = document.getElementById('trainingScreen');
  resultsScreen = document.getElementById('resultsScreen');
  
  startTraining = document.getElementById('startTraining');
  endTraining = document.getElementById('endTraining');
  startNewTraining = document.getElementById('startNewTraining');
  
  standardMode = document.getElementById('standardMode');
  customMode = document.getElementById('customMode');
  modeDescription = document.getElementById('modeDescription');
  customModeControls = document.getElementById('customModeControls');
  

  durationSlider = document.getElementById('durationSlider');
  durationValue = document.getElementById('durationValue');
  
  statusMessage = document.getElementById('statusMessage');
  answerInput = document.getElementById('answerInput');
  currentISI = document.getElementById('currentISI');
  timerCircle = document.getElementById('timerCircle');
  minutesLeft = document.getElementById('minutesLeft');
  secondsLeft = document.getElementById('secondsLeft');
  
  correctCount = document.getElementById('correctCount');
  totalCount = document.getElementById('totalCount');
  accuracyRate = document.getElementById('accuracyRate');
  minISI = document.getElementById('minISI');
  historyContainer = document.getElementById('historyContainer');
  
  useNumberPadToggle = document.getElementById('useNumberPad');
  numberpad = document.getElementById('numberpad');
  numberpadButtons = document.querySelectorAll('.numberpad-button');


  
  // Initialize Howler audio system
  initializeHowlerAudio();
  
  // Initialize beep audio system
  initializeBeepAudio();
  
  // Hide the status message div (no feedback)
  statusMessage.style.display = 'none';

  // Set initial mode description
        modeDescription.innerHTML = '<p><strong>Standard Mode:</strong> The training will last for 20 minutes with an initial interval of 3 seconds between numbers. The timing will adjust automatically based on your performance.</p>';
  
  // Update UI to reflect loaded settings
  updateBeepUI();
  
  // Update audio speed UI to reflect loaded settings
  updateAudioSpeedUI();
  
  // CRITICAL FIX: Ensure standard mode is properly set after loading settings
  updateStandardModeUI();
  
  // Initialize cumulative stats display
  updateCumulativeStats();
  
  // Initialize all event listeners after DOM elements are available
  
  // Mode switching
  standardMode.addEventListener('click', function() {
    standardMode.classList.add('active');
    customMode.classList.remove('active');
    manualMode.classList.remove('active');
    customModeControls.style.display = 'none';
    manualModeControls.style.display = 'none';
    isStandardMode = true;
    isCustomMode = false;
    isManualMode = false;
    
    // Load standard mode settings
    selectedISI = standardModeSettings.selectedISI;
    sessionDuration = standardModeSettings.sessionDuration;
    
    // Update UI to reflect standard mode settings
    updateStandardModeUI();
    
    modeDescription.innerHTML = '<p><strong>Standard Mode:</strong> The training will last for 20 minutes with an initial interval of 3 seconds between numbers. The timing will adjust automatically based on your performance.</p>';
  });

  customMode.addEventListener('click', function() {
    standardMode.classList.remove('active');
    customMode.classList.add('active');
    manualMode.classList.remove('active');
    customModeControls.style.display = 'block';
    manualModeControls.style.display = 'none';
    isStandardMode = false;
    isCustomMode = true;
    isManualMode = false;
    
    // Load custom mode settings
    selectedISI = customModeSettings.selectedISI;
    sessionDuration = customModeSettings.sessionDuration;
    
    // Update UI to reflect custom mode settings
    updateCustomModeUI();
    
    modeDescription.innerHTML = '<p><strong>Custom Mode:</strong> Customize the duration and starting timing of your training session.</p>';
  });

  // Manual mode event listener
  const manualMode = document.getElementById('manualMode');
  const manualModeControls = document.getElementById('manualModeControls');
  manualMode.addEventListener('click', function() {
    standardMode.classList.remove('active');
    customMode.classList.remove('active');
    manualMode.classList.add('active');
    customModeControls.style.display = 'none';
    manualModeControls.style.display = 'block';
    isStandardMode = false;
    isCustomMode = false;
    isManualMode = true;
    
    // Load manual mode settings
    selectedISI = manualModeSettings.selectedISI;
    sessionDuration = manualModeSettings.sessionDuration;
    
    // Update UI to reflect manual mode settings
    updateManualModeUI();
    
    // In manual mode, set the ISI to the currently selected value and keep it constant
    if (selectedISI) {
      currentISIValue = selectedISI;
      currentISI.textContent = currentISIValue;
    }
    
    modeDescription.innerHTML = '<p><strong>Manual Mode:</strong> The timing interval will stay fixed at your selected setting throughout the entire training session, regardless of your performance.</p>';
  });

  // Progress button event listener
  const progressTab = document.getElementById('progressTab');
  progressTab.addEventListener('click', function() {
    // Show the progress modal
    const progressModal = document.getElementById('progressModal');
    if (progressModal) {
      progressModal.classList.remove('hidden');
      updateProgressDisplay(); // Update the display with latest data
      updateCumulativeStats(); // Also update cumulative stats
    }
  });

  // Mode filter event listener
  const modeFilter = document.getElementById('modeFilter');
  if (modeFilter) {
    modeFilter.addEventListener('change', function() {
      updateProgressDisplay(); // Update the display when mode filter changes
    });
  }

  // Close progress modal event listeners
  const closeProgressModal = document.getElementById('closeProgressModal');
  if (closeProgressModal) {
    closeProgressModal.addEventListener('click', function() {
      const progressModal = document.getElementById('progressModal');
      if (progressModal) {
        progressModal.classList.add('hidden');
      }
    });
  }

  // Close modal when clicking outside
  const progressModal = document.getElementById('progressModal');
  if (progressModal) {
    progressModal.addEventListener('click', function(e) {
      if (e.target === progressModal) {
        progressModal.classList.add('hidden');
      }
    });
  }

  // Close modal with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const progressModal = document.getElementById('progressModal');
      if (progressModal && !progressModal.classList.contains('hidden')) {
        progressModal.classList.add('hidden');
      }
      
    }
  });




  // Set up ISI buttons
  const isiButtons = document.querySelectorAll('.isi-button');
  isiButtons.forEach(button => {
    button.addEventListener('click', function() {
      const isiValue = parseInt(this.getAttribute('data-isi'));
      // Ensure minimum ISI of 500ms
      if (isiValue >= 500) {
        isiButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        selectedISI = Math.max(500, isiValue);
        
        // Update settings based on current mode
        if (isCustomMode) {
          customModeSettings.selectedISI = selectedISI;
          saveCustomModeSettings();
        } else if (isManualMode) {
          manualModeSettings.selectedISI = selectedISI;
          // Save manual mode settings to localStorage
          localStorage.setItem('pasatManualModeSettings', JSON.stringify(manualModeSettings));
        }
        
        // If manual mode is active, immediately update currentISIValue to keep it constant
        if (isManualMode) {
          currentISIValue = selectedISI;
          currentISI.textContent = currentISIValue;
        }
      }
    });
  });

  // Set up duration slider
  durationSlider.addEventListener('input', function() {
    sessionDuration = parseInt(this.value);
    durationValue.textContent = sessionDuration;
    
    // Update custom mode settings and save
    customModeSettings.sessionDuration = sessionDuration;
    saveCustomModeSettings();
  });

  // Manual mode controls
  const manualDurationSlider = document.getElementById('manualDurationSlider');
  const manualDurationValue = document.getElementById('manualDurationValue');
  
  if (manualDurationSlider && manualDurationValue) {
    manualDurationSlider.addEventListener('input', function() {
      sessionDuration = parseInt(this.value);
      manualDurationValue.textContent = sessionDuration;
      
      // Update manual mode settings and save
      manualModeSettings.sessionDuration = sessionDuration;
      // Save manual mode settings to localStorage
      localStorage.setItem('pasatManualModeSettings', JSON.stringify(manualModeSettings));
    });
  }

  // N-back input event listener
  const nbackInput = document.getElementById('nbackValue');
  const nbackDescription = document.getElementById('nbackDescription');
  const nbackExample = document.getElementById('nbackExample');
  
  if (nbackInput && nbackDescription && nbackExample) {
    // Initialize UI with loaded value
    nbackInput.value = nbackSettings.value;
    updateNbackDescription(nbackSettings.value);
    
    nbackInput.addEventListener('input', function() {
      const value = parseInt(this.value) || 1;
      const clampedValue = Math.max(1, Math.min(10, value));
      
      if (clampedValue !== value) {
        this.value = clampedValue;
      }
      
      // Update settings and save
      nbackSettings.value = clampedValue;
      saveNbackSettings();
      
      // Update description
      updateNbackDescription(clampedValue);
    });
  }
  
  // Function to update N-back description
  function updateNbackDescription(value) {
    if (nbackDescription && nbackExample) {
      if (value === 1) {
        nbackDescription.textContent = 'Add the current number to the previous number';
        nbackExample.textContent = 'Example: 1-back means add current number to the previous number';
      } else if (value === 2) {
        nbackDescription.textContent = 'Add the current number to the number from 2 positions ago';
        nbackExample.textContent = 'Example: 2-back means add current number to the number from 2 positions ago';
      } else if (value === 3) {
        nbackDescription.textContent = 'Add the current number to the number from 3 positions ago';
        nbackExample.textContent = 'Example: 3-back means add current number to the number from 3 positions ago';
      } else {
        nbackDescription.textContent = `Add the current number to the number from ${value} positions ago`;
        nbackExample.textContent = `Example: ${value}-back means add current number to the number from ${value} positions ago`;
      }
      
      // Add experimental warning for N-back values > 1
      if (value > 1) {
        const warningElement = document.getElementById('nbackWarning');
        if (warningElement) {
          warningElement.style.display = 'block';
          warningElement.innerHTML = `
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-3">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="text-sm text-yellow-700">
                    <strong>Experimental Mode:</strong> ${value}-back Adaptive PASAT has not been scientifically validated. 
                    Research studies only tested 1-back Adaptive PASAT. Higher N-back values are provided as a fun challenge 
                    but may not provide the same cognitive benefits as the validated 1-back version.
                  </p>
                </div>
              </div>
            </div>
          `;
        }
      } else {
        // Hide warning for 1-back
        const warningElement = document.getElementById('nbackWarning');
        if (warningElement) {
          warningElement.style.display = 'none';
        }
      }
    }
  }

  // Voice control event listeners

  // Numberpad size control
  const numberpadSizeSlider = document.getElementById('numberpadSizeSlider');
  const numberpadSizeValue = document.getElementById('numberpadSizeValue');
  
  if (numberpadSizeSlider && numberpadSizeValue) {
    numberpadSizeSlider.addEventListener('input', function() {
      const size = parseFloat(this.value);
      const sizeText = size < 0.8 ? 'Small' : size > 1.2 ? 'Large' : 'Normal';
      numberpadSizeValue.textContent = sizeText;
      
      // Update CSS custom property for numberpad button size
      document.documentElement.style.setProperty('--numberpad-button-size', size);
      
      // If training is active, update the numberpad immediately
      if (trainingScreen.style.display !== 'none' && useNumberPad) {
        updateNumberpadSize();
      }
    });
  }

  useNumberPadToggle.addEventListener('change', function() {
    useNumberPad = this.checked;
    
    // Show/hide size controls based on numberpad toggle
    const sizeControls = document.getElementById('numberpadSizeControls');
    if (sizeControls) {
      sizeControls.style.display = useNumberPad ? 'block' : 'none';
    }
    
    // If training is active, update the interface immediately
    if (trainingScreen.style.display !== 'none') {
      if (useNumberPad) {
        answerInput.style.display = 'none';
        numberpad.style.display = 'grid';
        // Clear any pending input
        answerInput.value = '';
      } else {
        answerInput.style.display = 'block';
        numberpad.style.display = 'none';
        // Clear button selections
        numberpadButtons.forEach(btn => btn.classList.remove('selected'));
        answerInput.focus();
      }
    }
  });

  // Beep controls event listeners
  const useErrorBeepToggle = document.getElementById('useErrorBeep');
  const beepVolumeSlider = document.getElementById('beepVolumeSlider');
  const beepVolumeValue = document.getElementById('beepVolumeValue');
  
  if (useErrorBeepToggle) {
    useErrorBeepToggle.addEventListener('change', function() {
      beepSettings.enabled = this.checked;
      
      // Show/hide volume controls based on beep toggle
      const volumeControls = document.getElementById('beepVolumeControls');
      if (volumeControls) {
        volumeControls.style.display = beepSettings.enabled ? 'block' : 'none';
      }
      
      // Save settings
      saveBeepSettings();
    });
  }
  
  if (beepVolumeSlider && beepVolumeValue) {
    beepVolumeSlider.addEventListener('input', function() {
      const volume = parseFloat(this.value);
      beepSettings.volume = volume;
      
      // Update volume display text
      let volumeText = 'Medium';
      if (volume <= 0.3) {
        volumeText = 'Quiet';
      } else if (volume > 0.7) {
        volumeText = 'Loud';
      }
      beepVolumeValue.textContent = volumeText;
      
      // Update beep sound volume if initialized
      if (beepSound) {
        beepSound.volume(volume);
      }
      
      // Save settings
      saveBeepSettings();
    });
  }

  // Audio speed controls event listeners
  const audioSpeedSlider = document.getElementById('audioSpeedSlider');
  const audioSpeedValue = document.getElementById('audioSpeedValue');
  
  if (audioSpeedSlider && audioSpeedValue) {
    audioSpeedSlider.addEventListener('input', function() {
      const rate = parseFloat(this.value);
      audioSpeedSettings.rate = rate;
      
      // Update speed display text
      if (rate === 1.0) {
        audioSpeedValue.textContent = 'Normal (1.0x)';
      } else {
        audioSpeedValue.textContent = `Fast (${rate.toFixed(1)}x)`;
      }
      
      // Save settings
      saveAudioSpeedSettings();
    });
  }

  // Register button handlers
  
  numberpadButtons.forEach((button, index) => {
    
    function handleButtonInteraction(e) {
      e.preventDefault();

      if (!canProcessButtonClick()) {
        numberpadButtons.forEach(b => b.classList.remove('selected'));
        return;
      }

      const btn = e.currentTarget;
      const value = parseInt(btn.getAttribute('data-value'));

      // Clear all buttons and select current one
      numberpadButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      // Only process immediately if the answer is correct
      if (shouldProcessAnswerImmediately(value)) {
        answerProcessed = true;
        const success = processAnswer(value);
        
        if (!success) {
          answerProcessed = false;
          numberpadButtons.forEach(b => b.classList.remove('selected'));
        }
      } else {
        // Wrong answer - don't process immediately, let timeout handle it
        // The button remains selected so the timeout can find it
        // answerProcessed remains false so the timeout can process it
        
        // Add visual feedback that the answer is wrong
        btn.classList.add('incorrect-selection');
        setTimeout(() => {
          btn.classList.remove('incorrect-selection');
        }, 300);
      }
    }

    if (isTouchDevice) {
      button.addEventListener('touchstart', handleButtonInteraction, { passive: false });
    } else {
      button.addEventListener('mousedown', handleButtonInteraction);
    }
    
    button.addEventListener('click', function(e) {
      handleButtonInteraction(e);
    });
  });



  // Main event listeners
  startTraining.addEventListener('click', startSession);
  endTraining.addEventListener('click', endSession);

  // Theme toggle event listener (only on home page)
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  startNewTraining.addEventListener('click', function() {
    resultsScreen.style.display = 'none';
    descriptionScreen.style.display = 'block';
  });

  // Input handler - for typed mode, process correct answers immediately
  // Wrong answers wait for timeout
  answerInput.addEventListener('input', function() {
    if (!canProcessButtonClick()) {
      return;
    }
    
    const userInput = answerInput.value.trim();
    const userAnswer = Number(userInput);
    
    if (!isNaN(userAnswer) && userInput.length > 0) {
      // Check if this answer is correct
      if (userAnswer === correctAnswer) {
        // Correct answer - process immediately
        answerProcessed = true;
        const success = processAnswer(userAnswer);
        if (!success) {
          answerProcessed = false;
        }
      }
      // Wrong answer - don't process, let timeout handle it
    }
  });

  // Enter key handler - for typed mode, process correct answers immediately
  // Wrong answers wait for timeout
  answerInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter' && answerInput.value.trim() !== '') {
      if (!answerProcessed && canProcessButtonClick()) {
        const userInput = answerInput.value.trim();
        const userAnswer = Number(userInput);
        
        if (!isNaN(userAnswer) && userInput.length > 0) {
          // Check if this answer is correct
          if (userAnswer === correctAnswer) {
            // Correct answer - process immediately
            answerProcessed = true;
            const success = processAnswer(userAnswer);
            if (!success) {
              answerProcessed = false;
            }
          }
          // Wrong answer - don't process, let timeout handle it
        }
      }
    }
  });
  
  // Show version notice modal on page load
  const versionNoticeModal = document.getElementById('versionNoticeModal');
  const closeVersionNotice = document.getElementById('closeVersionNotice');
  
  if (versionNoticeModal && closeVersionNotice) {
    // Show modal immediately - it will stay visible until user clicks close button
    // versionNoticeModal.classList.remove('hidden');
    
    // Close button handler - only way to dismiss the modal
    closeVersionNotice.addEventListener('click', function() {
      versionNoticeModal.classList.add('hidden');
    });
    
    // Prevent closing on overlay click - modal must be explicitly closed via button
    const modalOverlay = versionNoticeModal.querySelector('.modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function(e) {
        // Prevent event from bubbling to close the modal
        e.stopPropagation();
      });
    }
  }
});

// Handle page visibility changes - no more pausing
document.addEventListener('visibilitychange', function() {
  // Page visibility changes no longer affect training - removed pause functionality
});

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', function() {
  // Stop all audio and cleanup contexts
  stopAllAudio();
  
  // Beep system cleanup handled in stopAllAudio()
  
  // Clear all timers
  if (trainingTimerId) {
    clearInterval(trainingTimerId);
    trainingTimerId = null;
  }
  
  if (currentIntervalId) {
    clearTimeout(currentIntervalId);
    currentIntervalId = null;
  }
  
  // Stop all Howler sounds
  try {
    for (let i = 1; i <= 9; i++) {
      if (numberSounds[i]) {
        numberSounds[i].stop();
        numberSounds[i].unload();
      }
    }
    
    // Stop and unload beep sound
    if (beepSound) {
      beepSound.stop();
      beepSound.unload();
    }
  } catch (e) {
    // Ignore cleanup errors
  }
});

// Load audio speed settings from localStorage
function loadAudioSpeedSettings() {
  try {
    const saved = localStorage.getItem('pasatAudioSpeedSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      audioSpeedSettings.rate = Math.max(1.0, Math.min(1.5, settings.rate || 1.0));
      
      // Update UI to reflect loaded settings
      updateAudioSpeedUI();
    }
  } catch (error) {
    console.error('Error loading audio speed settings:', error);
  }
}

// Save audio speed settings to localStorage
function saveAudioSpeedSettings() {
  try {
    localStorage.setItem('pasatAudioSpeedSettings', JSON.stringify(audioSpeedSettings));
  } catch (error) {
    console.error('Error saving audio speed settings:', error);
  }
}

