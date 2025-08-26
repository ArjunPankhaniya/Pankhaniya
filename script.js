// ===== Firebase Setup and Initialization =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, update, remove, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { firebaseConfig } from "./firebase-config.js";

console.log("Firebase config loaded:");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// ===== DOM Elements =====
const loginContainer = document.getElementById("loginContainer");
const mainContent = document.getElementById("mainContent");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");
const treeContainer = document.getElementById("treeContainer");
const emptyTreeMessage = document.getElementById("emptyTreeMessage");
const selectedMemberDetails = document.getElementById("selectedMemberDetails");
const addRootBtn = document.getElementById("addRootBtn");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const memberForm = document.getElementById("memberForm");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const exportBtn = document.getElementById("exportBtn");
const searchInput = document.getElementById("searchInput");
const expandAllBtn = document.getElementById("expandAllBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const relationshipTypeSelect = document.getElementById("relationshipType");
const relationshipInput = document.getElementById("relationship");
const adminControls = document.getElementById("adminControls");
const authToggleBtn = document.getElementById("authToggleBtn");

let allMembers = {};
let selectedMemberId = null;
let currentSelectedCard = null;

// ===== Auth State Observer =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginContainer.classList.add("hidden");
        adminControls.classList.remove("hidden");
        authToggleBtn.classList.add("hidden");
        mainContent.classList.remove("hidden");
    } else {
        loginContainer.classList.add("hidden");
        adminControls.classList.add("hidden");
        authToggleBtn.classList.remove("hidden");
        mainContent.classList.remove("hidden");
    }
});

// Initial fetch and display
fetchAndDisplayTree();

// ===== Event Listeners =====
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginStatus.textContent = "";
    } catch (error) {
        loginStatus.textContent = "❌ Login failed: " + error.message;
    }
});

logoutBtn.addEventListener("click", () => signOut(auth));
addRootBtn.addEventListener("click", () => openModal("add-root"));
modalCancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
});
exportBtn.addEventListener("click", exportFamilyTree);
searchInput.addEventListener("input", () => displayFamilyTree());
expandAllBtn.addEventListener("click", () => toggleAllDetails(true));
collapseAllBtn.addEventListener("click", () => toggleAllDetails(false));
authToggleBtn.addEventListener("click", () => {
    loginContainer.classList.toggle("hidden");
    const isHidden = loginContainer.classList.contains("hidden");
    authToggleBtn.innerHTML = isHidden ? '<i class="fas fa-user-lock"></i> Admin Login' : '<i class="fas fa-times-circle"></i> Close Login';
});

// ===== Modal and Form Handling =====
memberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mode = modal.dataset.mode;
    const formData = new FormData(memberForm);
    const memberData = Object.fromEntries(formData.entries());
    const photoFile = memberForm.photo.files[0];

    try {
        if (mode === "add-root") {
            await addMemberToDB(memberData, null, photoFile);
        } else if (mode === "add-child") {
            const relationshipType = relationshipTypeSelect.value;
            if (relationshipType === "child") {
                await addMemberToDB({ ...memberData, relationship: "Child" }, selectedMemberId, photoFile);
            } else if (relationshipType === "spouse") {
                await addSpouseToDB(memberData, selectedMemberId, photoFile);
            } else if (relationshipType === "sibling") {
                await addSiblingToDB(memberData, selectedMemberId, photoFile);
            }
        } else if (mode === "edit") {
            await updateMemberInDB(selectedMemberId, memberData, photoFile);
        }
        modal.classList.add("hidden");
    } catch (error) {
        alert("Error saving member: " + error.message);
    }
});

document.getElementById("status").addEventListener("change", (e) => {
    const dodInput = document.getElementById("dod");
    if (e.target.value === "Deceased") {
        dodInput.classList.remove("hidden");
        dodInput.required = true;
    } else {
        dodInput.classList.add("hidden");
        dodInput.required = false;
    }
});

function openModal(mode, member = null) {
    modal.classList.remove("hidden");
    modal.dataset.mode = mode;
    memberForm.reset();
    document.getElementById("dod").classList.add("hidden");
    relationshipTypeSelect.classList.add("hidden");
    
    if (mode === "add-root") {
        modalTitle.textContent = "Add Root Member";
    } else if (mode === "add-child") {
        modalTitle.textContent = "Add Member Related to " + allMembers[selectedMemberId].name;
        relationshipTypeSelect.classList.remove("hidden");
    } else if (mode === "edit" && member) {
        modalTitle.textContent = "Edit " + member.name;
        memberForm.name.value = member.name || "";
        memberForm.meta.value = member.meta || "";
        memberForm.dob.value = member.dob || "";
        memberForm.city.value = member.city || "";
        memberForm.contact.value = member.contact || "";
        memberForm.status.value = member.status || "";
        if (member.status === "Deceased") {
            document.getElementById("dod").classList.remove("hidden");
            memberForm.dod.value = member.dod || "";
        }
    }
}

// ===== Firebase Functions (CRUD) =====
async function uploadPhoto(file, memberId) {
    if (!file) return null;
    const storageRef = sRef(storage, `photos/${memberId}_${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

async function addMemberToDB(memberData, parentId, photoFile) {
    const newMemberRef = push(ref(db, "members"));
    const memberId = newMemberRef.key;
    let photoURL = null;
    if (photoFile) {
        photoURL = await uploadPhoto(photoFile, memberId);
    }
    const finalData = {
        id: memberId,
        parentId: parentId || null,
        ...memberData,
        photoURL: photoURL
    };
    await set(newMemberRef, finalData);
}

async function addSpouseToDB(memberData, partnerId, photoFile) {
    const newMemberRef = push(ref(db, "members"));
    const memberId = newMemberRef.key;
    let photoURL = null;
    if (photoFile) {
        photoURL = await uploadPhoto(photoFile, memberId);
    }
    const finalData = {
        id: memberId,
        spouseOf: partnerId,
        ...memberData,
        photoURL: photoURL,
        relationship: "Spouse"
    };
    await set(newMemberRef, finalData);
    await update(ref(db, `members/${partnerId}`), { spouseOf: memberId });
}

async function addSiblingToDB(memberData, siblingId, photoFile) {
    const sibling = allMembers[siblingId];
    if (!sibling || sibling.parentId === undefined) {
        alert("Cannot add a sibling to this member.");
        return;
    }

    const newMemberRef = push(ref(db, "members"));
    const memberId = newMemberRef.key;
    let photoURL = null;
    if (photoFile) {
        photoURL = await uploadPhoto(photoFile, memberId);
    }
    const finalData = {
        id: memberId,
        parentId: sibling.parentId,
        ...memberData,
        photoURL: photoURL,
        relationship: "Brother/Sister"
    };
    await set(newMemberRef, finalData);
}

async function updateMemberInDB(memberId, updates, photoFile) {
    let photoURL = null;
    if (photoFile) {
        photoURL = await uploadPhoto(photoFile, memberId);
        updates.photoURL = photoURL;
    }
    await update(ref(db, `members/${memberId}`), updates);
}

async function deleteMemberFromDB(memberId) {
    if (confirm("Are you sure you want to delete this member and all their descendants?")) {
        const membersToDelete = getDescendants(memberId);
        membersToDelete.forEach(async (id) => {
            await remove(ref(db, `members/${id}`));
        });
    }
}

function getDescendants(memberId) {
    let descendants = [memberId];
    const children = Object.values(allMembers).filter(m => m.parentId === memberId);
    children.forEach(child => {
        descendants = descendants.concat(getDescendants(child.id));
    });
    return descendants;
}

// ===== Tree Rendering and Management =====
function fetchAndDisplayTree() {
    onValue(ref(db, "members"), (snapshot) => {
        allMembers = snapshot.val() || {};
        displayFamilyTree();
    });
}

function displayFamilyTree() {
    const tree = buildTreeHierarchy(allMembers);
    const searchTerm = (searchInput.value || "").trim().toLowerCase();

    treeContainer.innerHTML = "";
    const isUserLoggedIn = auth.currentUser !== null;

    if (Object.keys(tree).length === 0) {
        emptyTreeMessage.classList.remove("hidden");
        return;
    }
    emptyTreeMessage.classList.add("hidden");

    // 🔎 SEARCH MODE
    if (searchTerm) {
        const roots = Object.values(tree).filter(n => !n.parentId);
        let result = null;
        for (const root of roots) {
            const sub = searchTree(root, searchTerm);
            if (sub) { result = sub; break; }
        }
        if (result) {
            const highlightId = findFirstMatch(result, searchTerm);
            renderTree(result, treeContainer, isUserLoggedIn, highlightId);

            // ✅ auto-center on search result
            setTimeout(() => {
                treeContainer.scrollLeft = (treeContainer.scrollWidth - treeContainer.clientWidth) / 2;
            }, 100);

            return;
        } else {
            treeContainer.innerHTML = `<p class="text-slate-500 text-center p-4">No members found.</p>`;
            return;
        }
    }

    // 🌳 NORMAL MODE (render full tree)
    const membersToDisplay = Object.values(tree);
    const rootMembers = membersToDisplay.filter(
        m => !m.parentId || !membersToDisplay.some(x => x.id === m.parentId)
    );
    rootMembers.forEach(root =>
        renderTree(root, treeContainer, isUserLoggedIn, null)
    );

    // ✅ After rendering full tree, auto-scroll to fixed member
    const FIXED_MEMBER_ID = "-OYQLmm-7X_XaXuAwohP";
    setTimeout(() => {
        const targetEl = document.getElementById(`member-${FIXED_MEMBER_ID}`);
        if (targetEl) {
            targetEl.scrollIntoView({
                behavior: "smooth",
                block: "start",
                inline: "center"
            });
        }
    }, 300);
}

function centerTree() {
  const container = document.getElementById("treeContainer");
  if (!container) return;

  container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  container.scrollTop = (container.scrollHeight - container.clientHeight) / 3; 
}

// Call after rendering tree
setTimeout(centerTree, 500);



// 🔍 Helper: first matching node ka id (pre-order)
function findFirstMatch(node, query) {
    if ((node.name || "").toLowerCase().includes(query)) return node.id;
    if (node.children && node.children.length) {
        for (const child of node.children) {
            const found = findFirstMatch(child, query);
            if (found) return found;
        }
    }
    return null;
}


// 🔎 Search subtree builder (parents ko preserve karta hai)
function searchTree(node, query) {
    let match = (node.name || "").toLowerCase().includes(query);
    const newNode = { ...node, children: [] };

    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            const res = searchTree(child, query);
            if (res) {
                newNode.children.push(res);
                match = true; // descendant match → parent ko rakhna hai
            }
        });
    }
    return match ? newNode : null;
}




function getBloodline(memberId, tree) {
    const result = {};
    const visited = new Set();

    function addWithChildren(m) {
        if (!m || visited.has(m.id)) return;
        visited.add(m.id);
        result[m.id] = m;

        if (m.children) {
            m.children.forEach(c => addWithChildren(tree[c.id]));
        }
    }

    function addAncestors(m) {
        if (!m || visited.has(m.id)) return;
        visited.add(m.id);
        result[m.id] = m;

        if (m.parentId && tree[m.parentId]) {
            const parent = tree[m.parentId];

            // ✅ siblings bhi include karna hai
            parent.children.forEach(sibling => {
                result[sibling.id] = sibling;
                if (sibling.children) {
                    sibling.children.forEach(c => addWithChildren(tree[c.id]));
                }
            });

            addAncestors(parent); // 👆 parent → grandparent → root tak
        }
    }

    const startNode = tree[memberId];
    if (startNode) {
        addWithChildren(startNode);  // current + uske children
        addAncestors(startNode);     // parent chain + siblings
    }

    return Object.values(result);
}





function buildTreeHierarchy(members) {
    const tree = {};
    for (const id in members) {
        const member = { ...members[id], children: [] };
        tree[id] = member;
    }
    
    for (const id in tree) {
        const member = tree[id];
        if (member.parentId && tree[member.parentId]) {
            tree[member.parentId].children.push(member);
        }
        if (member.spouseOf && tree[member.spouseOf]) {
            member.spouse = tree[member.spouseOf];
        }
    }

    // 🔑 Age-wise (DOB) sorting of siblings
    for (const id in tree) {
        if (tree[id].children && tree[id].children.length > 1) {
            tree[id].children.sort((a, b) => {
                if (!a.dob && !b.dob) return 0;
                if (!a.dob) return 1;   // jiska DOB missing hai woh right side chale jaye
                if (!b.dob) return -1;
                return new Date(a.dob) - new Date(b.dob); 
                // 👆 pehle born (older) left side me
            });
        }
    }

    return tree;
}


function renderTree(node, container, isUserLoggedIn, highlightId = null) {
    const nodeWrapper = document.createElement("div");
    nodeWrapper.className = "tree-node-wrapper";

    const card = document.createElement("div");
    card.className = "tree-member-card";
    card.id = `member-${node.id}`;
    card.dataset.id = node.id;
    
    
    let photoHtml = node.photoURL ? 
        `<img src="${node.photoURL}" class="member-photo" alt="${node.name}">` : 
        `<div class="photo-placeholder"><i class="fas fa-user"></i></div>`;

    let statusBadge = '';
    if (node.status === 'Alive') {
        statusBadge = `<span class="status-badge status-alive">હયાત</span>`;
    } else if (node.status === 'Deceased') {
        statusBadge = `<span class="status-badge status-deceased">સ્વ.</span>`;
    }

    let extraLabel = "";
    if (highlightId && node.id === highlightId) {
        extraLabel = `<span class="here-label bg-yellow-500 text-black px-2 py-0.5 rounded text-xs ml-2">You're Here</span>`;
    }

    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    cardContent.innerHTML = `
        ${photoHtml}
        <h4 class="member-name">${node.name} ${extraLabel}</h4>
        <p class="member-meta">${node.meta || ""}</p>
        ${statusBadge}
    `;

    card.appendChild(cardContent);
    
    card.addEventListener("click", () => {
        selectedMemberId = node.id;
        
        // Deselect previous card
        if (currentSelectedCard) {
            currentSelectedCard.classList.remove('selected');
        }
        // Select new card
        currentSelectedCard = card;
        currentSelectedCard.classList.add('selected');

        displaySelectedMember(node);
    });

    if (isUserLoggedIn) {
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'mt-4 flex gap-2 justify-center';
        actionsContainer.innerHTML = `
            <button class="px-3 py-1 text-sm rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition-colors" data-action="add-child"><i class="fas fa-user-plus"></i> Add</button>
            <button class="px-3 py-1 text-sm rounded-lg bg-gray-600 hover:bg-gray-700 text-white transition-colors" data-action="edit"><i class="fas fa-edit"></i> Edit</button>
            <button class="px-3 py-1 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors" data-action="delete"><i class="fas fa-trash-alt"></i> Del</button>
        `;
        card.appendChild(actionsContainer);
        actionsContainer.addEventListener('click', (e) => {
            const action = e.target.closest('button')?.dataset.action;
            if (action === "add-child") openModal("add-child");
            else if (action === "edit") openModal("edit", node);
            else if (action === "delete") deleteMemberFromDB(node.id);
        });
    }

    nodeWrapper.appendChild(card);
    container.appendChild(nodeWrapper);

    if (node.children && node.children.length > 0) {
        const childContainer = document.createElement("div");
        childContainer.className = "tree-children-container";
        nodeWrapper.appendChild(childContainer);
        node.children.forEach(child => renderTree(child, childContainer, isUserLoggedIn, highlightId));
    }
    return true;
}

function displaySelectedMember(member) {
    // 🔹 Father (parent) find karo
    let fatherName = "N/A";
    if (member.parentId && allMembers[member.parentId]) {
        fatherName = allMembers[member.parentId].name;
    }

    // 🔹 Children list banao (DOB wise sorted)
    let childrenNames = "None";
    let children = Object.values(allMembers).filter(m => m.parentId === member.id);

    if (children.length > 0) {
        children.sort((a, b) => {
            if (!a.dob && !b.dob) return 0;
            if (!a.dob) return 1;
            if (!b.dob) return -1;
            return new Date(a.dob) - new Date(b.dob); // bada pehle
        });
        childrenNames = children.map(c => c.name).join(", ");
    }

    selectedMemberDetails.innerHTML = `
        <div class="flex flex-col items-center text-center gap-6">
            ${member.photoURL ? 
                `<img src="${member.photoURL}" class="w-32 h-32 rounded-full object-cover border-4 border-cyan-500 shadow-lg" alt="${member.name}">` : 
                `<div class="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-6xl text-slate-600 border-4 border-cyan-500">👤</div>`}
            
            <div class="flex flex-col items-center">
                <h3 class="text-3xl font-bold text-white">${member.name}</h3>
                <p class="text-lg font-medium text-cyan-400 mt-1">${member.relationship || "N/A"}</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left w-full">
                <div class="flex items-center gap-3">
                    <i class="fas fa-calendar-alt text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">Date of Birth</p>
                        <p class="font-medium text-slate-200">${member.dob || "N/A"}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <i class="fas fa-briefcase text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">Status</p>
                        <p class="font-medium ${member.status === "Alive" ? "text-green-400" : "text-red-400"}">
                            ${member.status === "Alive" ? "હયાત" : member.status === "Deceased" ? "સ્વ." : "N/A"}
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <i class="fas fa-map-marker-alt text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">City</p>
                        <p class="font-medium text-slate-200">${member.city || "N/A"}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <i class="fas fa-phone-alt text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">Contact</p>
                        <p class="font-medium text-slate-200">${member.contact || "N/A"}</p>
                    </div>
                </div>

                <!-- 👨‍👦 Father -->
                <div class="flex items-center gap-3 sm:col-span-2">
                    <i class="fas fa-male text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">Father</p>
                        <p class="font-medium text-slate-200">${fatherName}</p>
                    </div>
                </div>

                <!-- 👶 Children (sorted by DOB) -->
                <div class="flex items-center gap-3 sm:col-span-2">
                    <i class="fas fa-child text-cyan-400"></i>
                    <div>
                        <p class="text-xs text-slate-400">Children</p>
                        <p class="font-medium text-slate-200">${childrenNames}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    selectedMemberDetails.scrollIntoView({
    behavior: "smooth",
    block: "start"   // ya "nearest"
    });
    selectedMemberDetails.classList.add("highlight-flash");
    setTimeout(() => selectedMemberDetails.classList.remove("highlight-flash"), 1000);

}


function toggleAllDetails(show) {
    document.querySelectorAll(".card-details").forEach(details => {
        if (show) {
            details.classList.remove("hidden");
        } else {
            details.classList.add("hidden");
        }
    });
}

function cleanMemberForExport(member, tree) {
    return {
        id: member.id,
        name: member.status === "Deceased" ? "સ્વ. " + member.name : member.name,
        dob: member.dob || null,
        dod: member.dod || null,
        status: member.status || null,
        city: member.city || null,
        contact: member.contact || null,
        relationship: member.relationship || null,
        meta: member.meta || null,
        photoURL: member.photoURL || null,
        children: member.children ? member.children.map(child => cleanMemberForExport(child, tree)) : []
    };
}

async function exportFamilyTree() {
    const tree = buildTreeHierarchy(allMembers);
    const rootMembers = Object.values(tree).filter(m => m.parentId === null);

    // 🔑 Clean tree banani hai for export
    const exportData = rootMembers.map(root => cleanMemberForExport(root, tree));

    const jsonString = JSON.stringify(exportData.length === 1 ? exportData[0] : exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "family-tree.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
