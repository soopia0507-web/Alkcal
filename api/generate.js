import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by Canvas or Defaults
const appId = typeof __app_id !== 'undefined' ? __app_id : 'class-sync-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "demo-api-key",
    authDomain: "demo.firebaseapp.com",
    projectId: "demo-project",
    storageBucket: "demo.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};

// Firebase Initialization
let app, db, auth;
try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch(e) {
    console.log("Firebase fallback initialization", e);
}

// Application State
let currentUser = {
    classCode: '',
    classPass: '',
    studentNum: '',
    name: '',
    role: 'student' // 'student', 'leader', 'teacher'
};

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let selectedDateStr = formatDateKey(new Date());

let tasksData = [];
let makeupsData = [];
let membersData = [];

let tasksUnsubscribe = null;
let makeupsUnsubscribe = null;
let membersUnsubscribe = null;

function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toastMessage');
    const toastText = document.getElementById('toastText');
    const toastIcon = document.getElementById('toastIcon');

    toastText.textContent = msg;
    toastIcon.className = isError ? "fa-solid fa-circle-xmark text-red-400" : "fa-solid fa-circle-check text-sky-400";

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// Dark / Light Mode Toggle Logic
window.toggleDarkMode = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    const icon = document.getElementById('themeIcon');
    if (isDark) {
        icon.className = 'fa-solid fa-sun text-yellow-400 text-lg';
    } else {
        icon.className = 'fa-solid fa-moon text-lg';
    }
};

// Date navigation
window.changeMonth = function(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    renderCalendar();
};

window.goToCurrentMonth = function() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    selectedDateStr = formatDateKey(today);
    renderCalendar();
    renderSelectedDateTasks();
};

window.handleGatewaySubmit = async function(e) {
    e.preventDefault();
    const classCode = document.getElementById('inputClassCode').value.trim();
    const classPass = document.getElementById('inputClassPass').value.trim();
    const studentNum = document.getElementById('inputStudentNum').value.trim();
    const studentName = document.getElementById('inputStudentName').value.trim();
    const role = document.querySelector('input[name="roleRadio"]:checked').value;

    if (!classCode || !classPass || !studentName) {
        showToast("모든 항목을 입력해 주세요.", true);
        return;
    }

    // Authenticate with Firebase if custom token or anonymous
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (err) {
        console.warn("Auth warning:", err);
    }

    currentUser = {
        classCode,
        classPass,
        studentNum,
        name: studentName,
        role
    };

    // Register / Update Roster member
    try {
        if (db) {
            const memberDocId = `${classCode}_${studentNum}_${studentName}`.replace(/[^a-zA-Z0-9_]/g, '_');
            const memberRef = doc(db, 'artifacts', appId, 'public', 'data', `members_${classCode}`, memberDocId);
            await setDoc(memberRef, {
                num: studentNum,
                name: studentName,
                role,
                joinedAt: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error("Error setting member", err);
    }

    // Update UI elements for current user
    document.getElementById('gatewayModal').classList.add('hidden');
    document.getElementById('userProfileArea').classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = studentName;
    document.getElementById('userNumDisplay').textContent = `${studentNum}`;

    const headerRoleBadge = document.getElementById('headerRoleBadge');
    headerRoleBadge.classList.remove('hidden');
    if (role === 'teacher') {
        headerRoleBadge.textContent = '선생님';
        headerRoleBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300";
        document.getElementById('addEvaluationBtn').classList.remove('hidden');
        document.getElementById('teacherMakeupSection').classList.remove('hidden');
    } else if (role === 'leader') {
        headerRoleBadge.textContent = '반장';
        headerRoleBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300";
        document.getElementById('addEvaluationBtn').classList.remove('hidden');
        document.getElementById('teacherMakeupSection').classList.add('hidden');
    } else {
        headerRoleBadge.textContent = '일반 학생';
        headerRoleBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 border border-sky-300";
        document.getElementById('addEvaluationBtn').classList.add('hidden');
        document.getElementById('teacherMakeupSection').classList.add('hidden');
    }

    document.getElementById('headerClassTitle').textContent = `${classCode} 반 수행평가 공유방`;

    // Subscribe to Firestore collections for this class room
    subscribeClassData();
    showToast(`${studentName}님, ${classCode} 학급방에 입장하셨습니다!`);
};

window.leaveClassRoom = function() {
    if (tasksUnsubscribe) tasksUnsubscribe();
    if (makeupsUnsubscribe) makeupsUnsubscribe();
    if (membersUnsubscribe) membersUnsubscribe();

    document.getElementById('gatewayModal').classList.remove('hidden');
    document.getElementById('userProfileArea').classList.add('hidden');
    showToast("학급방에서 퇴장하였습니다.");
};

function subscribeClassData() {
    if (!db || !currentUser.classCode) {
        // Fallback local memory data if offline or no DB
        renderAllViews();
        return;
    }

    // 1. Subscribe to Class Tasks
    const tasksCol = collection(db, 'artifacts', appId, 'public', 'data', `tasks_${currentUser.classCode}`);
    tasksUnsubscribe = onSnapshot(tasksCol, (snapshot) => {
        tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAllViews();
        checkD1Tasks();
    }, (err) => console.error("Tasks sync error", err));

    // 2. Subscribe to Class Makeup Assignments
    const makeupsCol = collection(db, 'artifacts', appId, 'public', 'data', `makeups_${currentUser.classCode}`);
    makeupsUnsubscribe = onSnapshot(makeupsCol, (snapshot) => {
        makeupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPersonalMakeups();
    }, (err) => console.error("Makeups sync error", err));

    // 3. Subscribe to Class Members Roster
    const membersCol = collection(db, 'artifacts', appId, 'public', 'data', `members_${currentUser.classCode}`);
    membersUnsubscribe = onSnapshot(membersCol, (snapshot) => {
        membersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderClassMembers();
    }, (err) => console.error("Members sync error", err));
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const monthNames = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
    document.getElementById('calendarMonthYear').textContent = `${currentYear}년 ${monthNames[currentMonth]}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const todayStr = formatDateKey(new Date());

    // Empty cells before day 1
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "min-h-[70px] sm:min-h-[85px] bg-slate-50/50 dark:bg-zinc-950/40 rounded-2xl p-1 border border-transparent";
        grid.appendChild(emptyCell);
    }

    // Fill Month Days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDateObj = new Date(currentYear, currentMonth, day);
        const dateKey = formatDateKey(dayDateObj);
        const dayOfWeek = dayDateObj.getDay();

        const cell = document.createElement('div');
        const isSelected = dateKey === selectedDateStr;
        const isToday = dateKey === todayStr;

        let bgClass = "bg-slate-50 dark:bg-zinc-800/60 hover:bg-sky-50 dark:hover:bg-zinc-800";
        if (isSelected) {
            bgClass = "bg-sky-100 dark:bg-sky-950/80 border-2 border-sky-500 shadow-md";
        } else if (isToday) {
            bgClass = "bg-sky-50 dark:bg-sky-900/30 border border-sky-300 dark:border-sky-700";
        }

        cell.className = `min-h-[70px] sm:min-h-[85px] rounded-2xl p-1.5 sm:p-2 cursor-pointer transition flex flex-col justify-between ${bgClass}`;
        cell.onclick = () => {
            selectedDateStr = dateKey;
            renderCalendar();
            renderSelectedDateTasks();
        };

        // Day Number Header
        let numColor = "text-slate-700 dark:text-zinc-200";
        if (dayOfWeek === 0) numColor = "text-red-500 font-bold";
        if (dayOfWeek === 6) numColor = "text-sky-500 font-bold";

        const topRow = document.createElement('div');
        topRow.className = "flex items-center justify-between";
        topRow.innerHTML = `
            <span class="text-xs sm:text-sm font-bold ${numColor}">${day}</span>
            ${isToday ? '<span class="text-[9px] bg-sky-500 text-white font-extrabold px-1.5 py-0.2 rounded-full">오늘</span>' : ''}
        `;
        cell.appendChild(topRow);

        // Task Badges inside cell
        const dayTasks = tasksData.filter(t => t.date === dateKey);
        const badgeContainer = document.createElement('div');
        badgeContainer.className = "space-y-1 mt-1 overflow-hidden";

        dayTasks.slice(0, 2).forEach(task => {
            const badge = document.createElement('div');
            badge.className = "text-[10px] font-semibold bg-sky-500 text-white truncate px-1.5 py-0.5 rounded-lg shadow-sm";
            badge.textContent = `[${task.subject}] ${task.title}`;
            badgeContainer.appendChild(badge);
        });

        if (dayTasks.length > 2) {
            const more = document.createElement('div');
            more.className = "text-[9px] text-sky-600 dark:text-sky-400 font-bold pl-1";
            more.textContent = `+${dayTasks.length - 2}개 더보기`;
            badgeContainer.appendChild(more);
        }

        cell.appendChild(badgeContainer);
        grid.appendChild(cell);
    }
}

function renderSelectedDateTasks() {
    const listEl = document.getElementById('selectedDateTasksList');
    const countBadge = document.getElementById('taskCountBadge');
    const titleEl = document.getElementById('selectedDateTitle');

    titleEl.textContent = `${selectedDateStr} 수행평가`;
    const matched = tasksData.filter(t => t.date === selectedDateStr);
    countBadge.textContent = `${matched.length}건`;

    if (matched.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-8 text-slate-400 dark:text-zinc-600 text-xs">
                <i class="fa-regular fa-calendar-xmark text-3xl mb-2 block"></i>
                이 날짜에 등록된 수행평가가 없습니다.
            </div>
        `;
        return;
    }

    listEl.innerHTML = matched.map(task => `
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-sky-300 transition">
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="bg-sky-500 text-white font-black text-xs px-2.5 py-0.5 rounded-lg">${task.subject}</span>
                    <h4 class="font-bold text-slate-900 dark:text-white text-sm sm:text-base">${task.title}</h4>
                </div>
                <p class="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    <i class="fa-regular fa-clock mr-1 text-sky-500"></i> ${task.time || '교시 미정'} | 작성자: ${task.author || '반장/선생님'}
                </p>
                ${task.desc ? `<p class="text-xs text-slate-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 p-2.5 rounded-xl mt-2 border border-slate-100 dark:border-zinc-800">${task.desc}</p>` : ''}
            </div>

            ${(currentUser.role === 'teacher' || currentUser.role === 'leader') ? `
                <button onclick="deleteTask('${task.id}')" class="self-end sm:self-center px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition">
                    <i class="fa-solid fa-trash-can mr-1"></i> 삭제
                </button>
            ` : ''}
        </div>
    `).join('');
}

function renderUpcomingTasks() {
    const listEl = document.getElementById('upcomingTasksList');
    const today = new Date();
    today.setHours(0,0,0,0);

    // Filter upcoming or today tasks
    const upcoming = tasksData.map(t => {
        const taskDate = new Date(t.date);
        taskDate.setHours(0,0,0,0);
        const diffTime = taskDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...t, diffDays };
    }).filter(t => t.diffDays >= 0).sort((a,b) => a.diffDays - b.diffDays);

    if (upcoming.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-6 text-slate-400 dark:text-zinc-600 text-xs">
                남아있는 수행평가 일정이 없습니다! 🥳
            </div>
        `;
        return;
    }

    listEl.innerHTML = upcoming.map(t => {
        let dDayBadge = `D-${t.diffDays}`;
        let badgeStyle = "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
        if (t.diffDays === 0) {
            dDayBadge = "D-DAY 오늘!";
            badgeStyle = "bg-red-500 text-white font-extrabold animate-pulse";
        } else if (t.diffDays === 1) {
            dDayBadge = "D-1 내일!";
            badgeStyle = "bg-amber-500 text-white font-extrabold";
        }

        return `
            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <div class="space-y-0.5">
                    <span class="text-[10px] font-extrabold text-sky-600 dark:text-sky-400">[${t.subject}]</span>
                    <h5 class="text-xs font-bold text-slate-800 dark:text-zinc-100 line-clamp-1">${t.title}</h5>
                    <p class="text-[10px] text-slate-400 dark:text-zinc-500">${t.date} ${t.time ? `(${t.time})` : ''}</p>
                </div>
                <span class="text-xs font-bold px-2.5 py-1 rounded-xl whitespace-nowrap shadow-sm ${badgeStyle}">
                    ${dDayBadge}
                </span>
            </div>
        `;
    }).join('');
}

function checkD1Tasks() {
    const today = new Date();
    today.setHours(0,0,0,0);

    const d1Tasks = tasksData.filter(t => {
        const taskDate = new Date(t.date);
        taskDate.setHours(0,0,0,0);
        const diffDays = Math.ceil((taskDate - today) / (1000 * 60 * 60 * 24));
        return diffDays === 1;
    });

    const banner = document.getElementById('d1Banner');
    const textEl = document.getElementById('d1BannerText');

    if (d1Tasks.length > 0) {
        banner.classList.remove('hidden');
        textEl.textContent = `내일 수행평가 [${d1Tasks[0].subject}] ${d1Tasks[0].title} (${d1Tasks[0].time || '시행'}) 가 예정되어 있습니다!`;
        
        // Native Browser notification
        if (Notification.permission === "granted") {
            new Notification("🚨 수행평가 D-1 알림!", {
                body: `내일 [${d1Tasks[0].subject}] ${d1Tasks[0].title} 수행평가가 있습니다. 준비를 완료하세요!`,
                icon: "https://cdn-icons-png.flaticon.com/512/2693/2693507.png"
            });
        }
    } else {
        banner.classList.add('hidden');
    }
}

window.closeD1Banner = function() {
    document.getElementById('d1Banner').classList.add('hidden');
};

window.requestNotificationPermission = function() {
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                showToast("브라우저 알림이 켜졌습니다!");
            } else {
                showToast("알림 권한이 거부되었습니다.", true);
            }
        });
    } else {
        showToast("이 브라우저는 푸시 알림을 지원하지 않습니다.", true);
    }
};

function renderPersonalMakeups() {
    const listEl = document.getElementById('personalMakeupList');
    const badgeCount = document.getElementById('personalMakeupCount');
    const notifDot = document.getElementById('makeupNotifDot');

    // Filter items addressed to current student (matches name or student num)
    const matched = makeupsData.filter(m => {
        if (!currentUser.name) return false;
        return m.targetStudent.includes(currentUser.name) || m.targetStudent.includes(currentUser.studentNum);
    });

    badgeCount.textContent = `${matched.length}건`;

    if (matched.length > 0) {
        notifDot.classList.remove('hidden');
    } else {
        notifDot.classList.add('hidden');
    }

    if (matched.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-6 text-slate-400 dark:text-zinc-600 text-xs">
                지정된 보충 수행평가가 없습니다.
            </div>
        `;
        return;
    }

    listEl.innerHTML = matched.map(m => `
        <div class="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <i class="fa-solid fa-bell"></i> ${m.subject}
                </span>
                <span class="text-[10px] text-amber-600 dark:text-amber-500 font-semibold">${m.date} ${m.time}</span>
            </div>
            <p class="text-xs text-slate-700 dark:text-zinc-200 font-medium">${m.note || '선생님이 지정하신 보충 수행평가입니다.'}</p>
            <div class="text-[10px] text-slate-500 dark:text-zinc-400 text-right">
                담당 선생님: ${m.teacherName || '선생님'}
            </div>
        </div>
    `).join('');
}

function renderClassMembers() {
    const listEl = document.getElementById('classMemberList');
    if (membersData.length === 0) {
        listEl.innerHTML = `<span class="text-xs text-slate-400">참가자 없음</span>`;
        return;
    }

    listEl.innerHTML = membersData.map(mem => {
        let badgeBg = "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300";
        if (mem.role === 'teacher') badgeBg = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold";
        if (mem.role === 'leader') badgeBg = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold";

        return `
            <span class="text-xs px-2.5 py-1 rounded-xl ${badgeBg} border border-slate-200/50 dark:border-zinc-700/50 flex items-center gap-1">
                ${mem.role === 'teacher' ? '👨‍🏫' : (mem.role === 'leader' ? '👑' : '🎓')} ${mem.num || ''} ${mem.name}
            </span>
        `;
    }).join('');
}

function renderAllViews() {
    renderCalendar();
    renderSelectedDateTasks();
    renderUpcomingTasks();
    renderPersonalMakeups();
    renderClassMembers();
}

window.openAddTaskModal = function() {
    document.getElementById('taskDate').value = selectedDateStr;
    document.getElementById('addTaskModal').classList.remove('hidden');
};

window.closeAddTaskModal = function() {
    document.getElementById('addTaskModal').classList.add('hidden');
};

window.handleAddTaskSubmit = async function(e) {
    e.preventDefault();
    const subject = document.getElementById('taskSubject').value.trim();
    const title = document.getElementById('taskTitle').value.trim();
    const date = document.getElementById('taskDate').value;
    const time = document.getElementById('taskTime').value.trim();
    const desc = document.getElementById('taskDesc').value.trim();

    if (!subject || !title || !date) return;

    const newTask = {
        subject,
        title,
        date,
        time,
        desc,
        author: currentUser.name,
        createdAt: new Date().toISOString()
    };

    if (db && currentUser.classCode) {
        try {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', `tasks_${currentUser.classCode}`);
            await addDoc(colRef, newTask);
            showToast("수행평가가 성공적으로 등록되었습니다!");
        } catch(err) {
            console.error("Error adding task:", err);
            showToast("등록 실패", true);
        }
    } else {
        tasksData.push({ id: Date.now().toString(), ...newTask });
        renderAllViews();
        showToast("수행평가가 등록되었습니다.");
    }

    closeAddTaskModal();
    document.getElementById('addTaskForm').reset();
};

window.deleteTask = async function(taskId) {
    if (db && currentUser.classCode) {
        try {
            const taskDocRef = doc(db, 'artifacts', appId, 'public', 'data', `tasks_${currentUser.classCode}`, taskId);
            await deleteDoc(taskDocRef);
            showToast("삭제되었습니다.");
        } catch(err) {
            console.error("Delete task err", err);
        }
    } else {
        tasksData = tasksData.filter(t => t.id !== taskId);
        renderAllViews();
        showToast("삭제되었습니다.");
    }
};

window.openAssignMakeupModal = function() {
    document.getElementById('assignMakeupModal').classList.remove('hidden');
};

window.closeAssignMakeupModal = function() {
    document.getElementById('assignMakeupModal').classList.add('hidden');
};

window.handleAssignMakeupSubmit = async function(e) {
    e.preventDefault();
    const targetStudent = document.getElementById('makeupTargetStudent').value.trim();
    const subject = document.getElementById('makeupSubject').value.trim();
    const date = document.getElementById('makeupDate').value;
    const time = document.getElementById('makeupTime').value.trim();
    const note = document.getElementById('makeupNote').value.trim();

    if (!targetStudent || !subject || !date) return;

    const newMakeup = {
        targetStudent,
        subject,
        date,
        time,
        note,
        teacherName: currentUser.name,
        createdAt: new Date().toISOString()
    };

    if (db && currentUser.classCode) {
        try {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', `makeups_${currentUser.classCode}`);
            await addDoc(colRef, newMakeup);
            showToast(`${targetStudent} 학생에게 보충 수행 메시지를 발송했습니다!`);
        } catch(err) {
            console.error("Error adding makeup:", err);
        }
    } else {
        makeupsData.push({ id: Date.now().toString(), ...newMakeup });
        renderPersonalMakeups();
        showToast("보충 수행 메시지가 지정되었습니다.");
    }

    closeAssignMakeupModal();
    document.getElementById('assignMakeupForm').reset();
};

window.toggleMakeupModal = function() {
    showToast("상단 보충 수행 내역을 확인해 주세요.");
};

// Initial Load setup
window.addEventListener('load', () => {
    renderCalendar();
    renderSelectedDateTasks();
});