// Elements
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const startButton = document.getElementById('start-button');
const exerciseButton = document.getElementById('exercise-button');
const exerciseControls = document.getElementById('exercise-controls');
const statusElement = document.getElementById('status');
const instructionsElement = document.getElementById('instructions');
const progressBar = document.getElementById('progress-bar');
const repsElement = document.getElementById('reps');
const holdTimeElement = document.getElementById('hold-time');
const tiltAngleElement = document.getElementById('tilt-angle');

// Exercise parameters
const HOLD_TIME_THRESHOLD = 3; // seconds to hold
const ANGLE_THRESHOLD = 15; // degrees
const TARGET_REPS = 5;

// State variables
let camera = null;
let pose = null;
let exerciseActive = false;
let reps = 0;
let holdStartTime = 0;
let currentHoldTime = 0;
let currentTiltAngle = 0;
let tiltDirection = 'none'; 
let previousTiltDirection = 'none';
let repCompleted = false;

// Initialize MediaPipe Pose
function initPose() {
    pose = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });
    
    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    pose.onResults(onResults);
}

// Start the webcam
startButton.onclick = function() {
    if (startButton.textContent === 'Start Camera') {
        startCamera();
        startButton.textContent = 'Stop Camera';
        statusElement.textContent = 'Camera active. Position yourself so your face and shoulders are visible.';
        exerciseButton.classList.remove('hidden');
    } else {
        stopCamera();
        startButton.textContent = 'Start Camera';
        statusElement.textContent = 'Camera stopped.';
        exerciseButton.classList.add('hidden');
        exerciseControls.classList.add('hidden');
    }
};

// Start the exercise
exerciseButton.onclick = function() {
    if (!exerciseActive) {
        startExercise();
        exerciseButton.textContent = 'Stop Exercise';
        exerciseControls.classList.remove('hidden');
    } else {
        stopExercise();
        exerciseButton.textContent = 'Start Exercise';
        exerciseControls.classList.add('hidden');
    }
};

function startCamera() {
    if (!pose) {
        initPose();
    }
    
    if (camera) {
        camera.stop();
    }
    
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await pose.send({image: videoElement});
        },
        width: 640,
        height: 480
    });
    camera.start();
}

function stopCamera() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    if (exerciseActive) {
        stopExercise();
    }
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function startExercise() {
    exerciseActive = true;
    reps = 0;
    holdStartTime = 0;
    currentHoldTime = 0;
    tiltDirection = 'none';
    previousTiltDirection = 'none';
    repCompleted = false;
    
    updateStats();
    statusElement.textContent = 'Exercise started. Tilt your neck to the left or right.';
    instructionsElement.textContent = `Tilt your head to either side until you reach ${ANGLE_THRESHOLD}° and hold for ${HOLD_TIME_THRESHOLD} seconds. Complete ${TARGET_REPS} reps on each side.`;
}

function stopExercise() {
    exerciseActive = false;
    statusElement.textContent = 'Exercise stopped.';
    instructionsElement.textContent = 'This application will guide you through neck tilt exercises.';
}

function updateStats() {
    repsElement.textContent = `Reps: ${reps}/${TARGET_REPS*2}`;
    holdTimeElement.textContent = `Hold: ${currentHoldTime.toFixed(1)}s`;
    tiltAngleElement.textContent = `Angle: ${Math.abs(currentTiltAngle).toFixed(1)}°`;
    
    // Update progress bar
    const progress = (reps / (TARGET_REPS * 2)) * 100;
    progressBar.style.width = `${progress}%`;
    
    // Check if exercise is complete
    if (reps >= TARGET_REPS * 2) {
        exerciseActive = false;
        statusElement.textContent = 'Exercise complete! Great job!';
        exerciseButton.textContent = 'Start Exercise';
    }
}

function onResults(results) {
    // Draw the pose landmarks on the canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the webcam feed on the canvas
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height);
        
    // Draw pose landmarks
    if (results.poseLandmarks) {
        // Draw only upper body landmarks with green color
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                      {color: '#00FF00', lineWidth: 2});
        drawLandmarks(canvasCtx, results.poseLandmarks,
                     {color: '#00FF00', lineWidth: 1});
        
        // Process pose for neck tilt exercise
        if (exerciseActive) {
            processPose(results.poseLandmarks);
        }
    }
    
    canvasCtx.restore();
}

function processPose(landmarks) {
    // Get landmarks for neck tilt
    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    // Check if all required landmarks are detected with reasonable confidence
    if (nose && leftEar && rightEar && leftShoulder && rightShoulder &&
        Math.min(nose.visibility, leftEar.visibility, rightEar.visibility, 
                leftShoulder.visibility, rightShoulder.visibility) > 0.7) {
        
        // Calculate shoulder midpoint (reference line)
        const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
        const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
        
        // Calculate neck midpoint
        const neckMidX = (leftEar.x + rightEar.x) / 2;
        const neckMidY = (leftEar.y + rightEar.y) / 2;
        
        // Calculate angle between vertical line from shoulders and the line to the nose
        const dx = nose.x - shoulderMidX;
        const dy = nose.y - shoulderMidY;
        
        // Calculate tilt angle (positive for right tilt, negative for left tilt)
        // Convert to degrees and adjust scale
        currentTiltAngle = Math.atan2(dx, dy) * (180 / Math.PI) * -1;
        
        // Determine tilt direction
        previousTiltDirection = tiltDirection;
        if (currentTiltAngle > ANGLE_THRESHOLD) {
            tiltDirection = 'right';
        } else if (currentTiltAngle < -ANGLE_THRESHOLD) {
            tiltDirection = 'left';
        } else {
            tiltDirection = 'none';
        }
        
        // Process hold time and reps
        const now = Date.now();
        
        if (tiltDirection !== 'none') {
            if (holdStartTime === 0 || previousTiltDirection !== tiltDirection) {
                holdStartTime = now;
                currentHoldTime = 0;
                repCompleted = false;
            } else {
                currentHoldTime = (now - holdStartTime) / 1000; // convert to seconds
                
                // Check if hold time threshold is reached
                if (currentHoldTime >= HOLD_TIME_THRESHOLD && !repCompleted) {
                    reps++;
                    repCompleted = true;
                    const side = tiltDirection === 'left' ? 'left' : 'right';
                    statusElement.textContent = `Good! ${side} tilt completed. ${reps}/${TARGET_REPS*2} reps done.`;

                }
            }
        } else {
            holdStartTime = 0;
            currentHoldTime = 0;
        }
        
        // Draw visual feedback
        drawFeedback(canvasCtx, nose, shoulderMidX, shoulderMidY, currentTiltAngle, tiltDirection);
        
        // Update stats display
        updateStats();
        
        // Update instructions based on state
        if (!repCompleted) {
            if (tiltDirection === 'none') {
                instructionsElement.textContent = `Tilt your head to either side until you reach ${ANGLE_THRESHOLD}° and hold for ${HOLD_TIME_THRESHOLD} seconds.`;
            } else {
                const remaining = Math.max(0, HOLD_TIME_THRESHOLD - currentHoldTime).toFixed(1);
                instructionsElement.textContent = `Good! Hold your ${tiltDirection} tilt for ${remaining} more seconds.`;
            }
        } else {
            instructionsElement.textContent = 'Return to center, then tilt to the other side.';
        }
    } else {
        // Not all landmarks detected with confidence
        statusElement.textContent = 'Please position yourself so your face and shoulders are clearly visible.';
    }
}

function drawFeedback(ctx, nose, shoulderMidX, shoulderMidY, angle, direction) {
    ctx.save();
    
    // Draw vertical reference line
    ctx.beginPath();
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 3;
    ctx.moveTo(shoulderMidX * canvasElement.width, 0);
    ctx.lineTo(shoulderMidX * canvasElement.width, canvasElement.height);
    ctx.stroke();
    
    // Draw current angle line
    ctx.beginPath();
    const color = direction === 'none' ? '#FFFF00' : 
                 (Math.abs(angle) > ANGLE_THRESHOLD && currentHoldTime >= HOLD_TIME_THRESHOLD) ? '#00FF00' : '#FF9900';
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.moveTo(shoulderMidX * canvasElement.width, shoulderMidY * canvasElement.height);
    ctx.lineTo(nose.x * canvasElement.width, nose.y * canvasElement.height);
    ctx.stroke();
    
    // Draw angle text
    ctx.font = '24px "Courier New"';
    ctx.fillStyle = '#00FF00';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.abs(angle).toFixed(1)}°`, nose.x * canvasElement.width, (nose.y * canvasElement.height) - 20);
    
    // If actively holding a pose, show a progress circle
    if (direction !== 'none') {
        const progress = Math.min(currentHoldTime / HOLD_TIME_THRESHOLD, 1);
        const radius = 30;
        
        ctx.beginPath();
        ctx.arc((shoulderMidX + (nose.x - shoulderMidX) * 0.5) * canvasElement.width, 
               (shoulderMidY + (nose.y - shoulderMidY) * 0.5) * canvasElement.height,
               radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw progress
        if (progress > 0) {
            ctx.beginPath();
            ctx.arc((shoulderMidX + (nose.x - shoulderMidX) * 0.5) * canvasElement.width, 
                   (shoulderMidY + (nose.y - shoulderMidY) * 0.5) * canvasElement.height,
                   radius, -Math.PI / 2, (2 * Math.PI * progress) - Math.PI / 2);
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 5;
            ctx.stroke();
        }
    }
    
    ctx.restore();
}

// Set canvas dimensions
function resizeCanvas() {
    canvasElement.width = videoElement.videoWidth || 640;
    canvasElement.height = videoElement.videoHeight || 480;
}

// Handle window resize
window.addEventListener('resize', resizeCanvas);
videoElement.addEventListener('loadedmetadata', resizeCanvas);

// Initialize the page
resizeCanvas();