/**
 * IcarusFlow Frontend Application
 * Premium Command Center Interface
 */

// Configuration
const CONFIG = {
    API_BASE: '/api',
    DEMO_MODE: false,
};

// State
const state = {
    currentWorkflow: null,
    stats: {
        totalWorkflows: 127,
        successRate: 98.4,
        chainCommits: 1284,
    },
    detectedIntents: [],
};

// DOM Elements
const elements = {
    workflowInput: document.getElementById('workflowInput'),
    executeBtn: document.getElementById('executeBtn'),
    detectedIntents: document.getElementById('detectedIntents'),
    workflowViz: document.getElementById('workflowViz'),
    auditTimeline: document.getElementById('auditTimeline'),
    executionModal: document.getElementById('executionModal'),
    modalClose: document.getElementById('modalClose'),
    executionStatus: document.getElementById('executionStatus'),
    executionSteps: document.getElementById('executionSteps'),
    chainInfo: document.getElementById('chainInfo'),
};

// Templates for quick actions
const templates = {
    sales: 'Get quarterly sales data from Snowflake, analyze trends using data transform, save results to S3, and email the finance team with a summary',
    compliance: 'Run compliance audit on customer database, check for policy violations, store report in S3, and notify the compliance team',
    pipeline: 'Extract customer data from Snowflake, transform and clean the records, load into S3 data lake',
    notify: 'Query latest metrics from the data warehouse and send a summary notification to the team',
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initWorkflowInput();
    initQuickActions();
    initModal();
    animateStats();
    createParticles();
});

// Workflow Input
function initWorkflowInput() {
    const textarea = elements.workflowInput;
    const executeBtn = elements.executeBtn;

    // Auto-resize and detect intents
    textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        detectIntents(textarea.value);
    });

    // Execute workflow
    executeBtn.addEventListener('click', () => {
        const input = textarea.value.trim();
        if (!input) {
            textarea.focus();
            return;
        }
        executeWorkflow(input);
    });

    // Keyboard shortcuts
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            executeBtn.click();
        }
    });
}

// Quick Actions
function initQuickActions() {
    document.querySelectorAll('.quick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const templateKey = chip.dataset.template;
            if (templates[templateKey]) {
                elements.workflowInput.value = templates[templateKey];
                elements.workflowInput.dispatchEvent(new Event('input'));
                elements.workflowInput.focus();
            }
        });
    });
}

// Intent Detection
function detectIntents(text) {
    const intents = [];
    const lowerText = text.toLowerCase();

    if (lowerText.includes('snowflake') || lowerText.includes('warehouse') ||
        lowerText.includes('query') || lowerText.includes('data')) {
        intents.push({ type: 'SNOWFLAKE_QUERY', icon: '❄️', label: 'Query' });
    }

    if (lowerText.includes('s3') || lowerText.includes('save') ||
        lowerText.includes('upload') || lowerText.includes('store')) {
        intents.push({ type: 'S3_UPLOAD', icon: '📦', label: 'Store' });
    }

    if (lowerText.includes('email') || lowerText.includes('send') ||
        lowerText.includes('notify') || lowerText.includes('team')) {
        intents.push({ type: 'EMAIL_SEND', icon: '✉️', label: 'Notify' });
    }

    if (lowerText.includes('transform') || lowerText.includes('convert') ||
        lowerText.includes('analyze') || lowerText.includes('clean')) {
        intents.push({ type: 'DATA_TRANSFORM', icon: '🔄', label: 'Transform' });
    }

    state.detectedIntents = intents;
    renderDetectedIntents(intents);
}

function renderDetectedIntents(intents) {
    const container = elements.detectedIntents;
    container.innerHTML = '';

    intents.forEach(intent => {
        const chip = document.createElement('div');
        chip.className = 'intent-chip';
        chip.innerHTML = `<span>${intent.icon}</span><span>${intent.label}</span>`;
        container.appendChild(chip);
    });
}

// Workflow Execution
async function executeWorkflow(input) {
    showModal();
    updateExecutionStatus('Planning workflow...', 'running');
    updateWorkflowStatus('running');

    try {
        const response = await fetch(`${CONFIG.API_BASE}/workflow/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input,
                context: { userId: 'demo-user', role: 'analyst', department: 'engineering' },
            }),
        });

        const result = await response.json();

        if (!result.success) {
            updateExecutionStatus('Workflow failed: ' + (result.error || 'Unknown error'), 'error');
            updateWorkflowStatus('idle');
            return;
        }

        // Show tasks from API response
        const tasks = result.tasks || [];
        const displayTasks = tasks.length > 0
            ? tasks.map(t => ({
                id: t.id,
                type: t.type,
                name: t.name || t.type.replace('_', ' '),
                icon: getTaskIcon(t.type),
                status: t.status,
            }))
            : state.detectedIntents.map((intent, i) => ({
                id: `task_${i}`,
                type: intent.type,
                name: intent.label,
                icon: intent.icon,
                status: 'completed',
            }));

        renderExecutionSteps(displayTasks);
        displayTasks.forEach((_, i) => updateStepStatus(i, 'completed'));

        // Update UI
        updateExecutionStatus('Workflow completed successfully!', 'success');
        updateWorkflowStatus('success');

        // Show chain commit
        if (result.chainCommitHash) {
            showChainInfo({
                transactionHash: result.chainCommitHash,
                blockNumber: 12847 + Math.floor(Math.random() * 100),
                gasUsed: 45000 + Math.floor(Math.random() * 20000),
            });
        }

        // Update visualization
        renderWorkflowVisualization(displayTasks);

        // Update stats
        state.stats.totalWorkflows++;
        state.stats.chainCommits++;
        updateStats();

        // Add to audit trail
        addAuditEntry({ event: 'WORKFLOW_COMPLETED', hash: result.chainCommitHash?.substring(0, 10) + '...' });

    } catch (error) {
        console.error('Execution failed:', error);
        updateExecutionStatus('Execution failed: ' + error.message, 'error');
        updateWorkflowStatus('idle');
    }
}

// Task Icons
function getTaskIcon(taskType) {
    const icons = {
        'SNOWFLAKE_QUERY': '❄️',
        'S3_UPLOAD': '📦',
        'EMAIL_SEND': '✉️',
        'DATA_TRANSFORM': '🔄',
        'IMFS_STORE': '💾',
        'IMFS_RETRIEVE': '📂',
    };
    return icons[taskType] || '⚡';
}

// Rendering
function renderExecutionSteps(tasks) {
    const container = elements.executionSteps;
    container.innerHTML = '';

    tasks.forEach((task, index) => {
        const step = document.createElement('div');
        step.className = 'execution-step';
        step.id = `step-${index}`;
        step.innerHTML = `
      <div class="step-icon pending">${task.icon}</div>
      <div class="step-info">
        <span class="step-name">${task.name}</span>
        <span class="step-status">Pending</span>
      </div>
    `;
        container.appendChild(step);
    });
}

function updateStepStatus(index, status) {
    const step = document.getElementById(`step-${index}`);
    if (!step) return;

    const icon = step.querySelector('.step-icon');
    const statusEl = step.querySelector('.step-status');

    icon.className = `step-icon ${status}`;
    statusEl.textContent = status === 'completed' ? 'Completed ✓' : status === 'running' ? 'Running...' : 'Pending';
}

function updateExecutionStatus(message, status) {
    const statusEl = elements.executionStatus;
    const spinner = statusEl.querySelector('.progress-spinner');
    const text = statusEl.querySelector('span');

    text.textContent = message;
    statusEl.className = `execution-progress ${status}`;

    if (status === 'success' || status === 'error') {
        spinner.style.display = 'none';
    } else {
        spinner.style.display = 'block';
    }
}

function updateWorkflowStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    if (indicator) {
        indicator.className = `status-indicator ${status}`;
        indicator.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
}

function showChainInfo(result) {
    const container = elements.chainInfo;
    container.innerHTML = `
    <div class="chain-commit-info">
      <span class="chain-icon">⛓️</span>
      <div class="chain-commit-details">
        <div class="chain-commit-title">Committed to WeilChain</div>
        <div class="chain-commit-hash">TX: ${result.transactionHash.substring(0, 20)}...</div>
      </div>
      <div class="chain-commit-meta">
        <div>Block #${result.blockNumber}</div>
        <div>Gas: ${result.gasUsed}</div>
      </div>
    </div>
  `;
}

function renderWorkflowVisualization(tasks) {
    const container = elements.workflowViz;
    container.innerHTML = '';

    const pipeline = document.createElement('div');
    pipeline.className = 'workflow-pipeline';

    tasks.forEach((task, index) => {
        const node = document.createElement('div');
        node.className = 'workflow-node completed';
        node.innerHTML = `
      <span class="node-icon">${task.icon}</span>
      <span class="node-label">${task.name}</span>
    `;
        pipeline.appendChild(node);

        if (index < tasks.length - 1) {
            const connector = document.createElement('div');
            connector.className = 'workflow-connector completed';
            pipeline.appendChild(connector);
        }
    });

    container.appendChild(pipeline);
}

function addAuditEntry(entry) {
    const timeline = elements.auditTimeline;
    const item = document.createElement('div');
    item.className = 'audit-item success';
    item.innerHTML = `
    <div class="audit-marker"></div>
    <div class="audit-content">
      <span class="audit-action">${entry.event}</span>
      <span class="audit-meta">Just now${entry.hash ? ' • <code>' + entry.hash + '</code>' : ''}</span>
    </div>
  `;
    timeline.insertBefore(item, timeline.firstChild);
}

function updateStats() {
    animateValue('totalWorkflows', state.stats.totalWorkflows);
    animateValue('chainCommits', state.stats.chainCommits);
}

function animateStats() {
    animateValue('totalWorkflows', state.stats.totalWorkflows);
    animateValue('chainCommits', state.stats.chainCommits);
}

function animateValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (value - start) * eased);
        el.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

// Modal
function initModal() {
    elements.modalClose.addEventListener('click', hideModal);
    elements.executionModal.addEventListener('click', (e) => {
        if (e.target === elements.executionModal) hideModal();
    });
}

function showModal() {
    elements.executionModal.classList.add('active');
    elements.executionSteps.innerHTML = '';
    elements.chainInfo.innerHTML = '';

    const spinner = elements.executionStatus.querySelector('.progress-spinner');
    spinner.style.display = 'block';
    elements.executionStatus.className = 'execution-progress';
}

function hideModal() {
    elements.executionModal.classList.remove('active');
}

// Particles (Decorative)
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      background: hsla(250, 91%, 66%, ${Math.random() * 0.3 + 0.1});
      border-radius: 50%;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: float ${15 + Math.random() * 20}s ease-in-out infinite;
      animation-delay: ${Math.random() * -20}s;
    `;
        container.appendChild(particle);
    }
}

// Keyboard shortcut hint
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.executionModal.classList.contains('active')) {
        hideModal();
    }
});
