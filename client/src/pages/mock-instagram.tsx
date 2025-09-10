import { useState, useEffect, useRef } from 'react';
import '@/styles/mock-instagram.css';

// Mock viewer data with timestamps (simulating when they viewed the story)
const mockViewers = [
  { username: 'sarah_jones', displayName: 'Sarah Jones', profilePic: 'https://i.pravatar.cc/150?u=sarah', isVerified: true, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 2 }, // 2 min ago
  { username: 'mike_wilson', displayName: 'Mike Wilson', profilePic: 'https://i.pravatar.cc/150?u=mike', isVerified: false, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 5 }, // 5 min ago
  { username: 'emma_davis', displayName: 'Emma Davis', profilePic: 'https://i.pravatar.cc/150?u=emma', isVerified: false, isFollower: false, viewedAt: Date.now() - 1000 * 60 * 8 }, // 8 min ago
  { username: 'alex_martin', displayName: 'Alex Martin', profilePic: 'https://i.pravatar.cc/150?u=alex', isVerified: true, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 12 }, // 12 min ago
  { username: 'lisa_brown', displayName: 'Lisa Brown', profilePic: 'https://i.pravatar.cc/150?u=lisa', isVerified: false, isFollower: false, viewedAt: Date.now() - 1000 * 60 * 15 }, // 15 min ago
  { username: 'chris_taylor', displayName: 'Chris Taylor', profilePic: 'https://i.pravatar.cc/150?u=chris', isVerified: false, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 20 }, // 20 min ago
  { username: 'jessica_lee', displayName: 'Jessica Lee', profilePic: 'https://i.pravatar.cc/150?u=jessica', isVerified: true, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 25 }, // 25 min ago
  { username: 'david_smith', displayName: 'David Smith', profilePic: 'https://i.pravatar.cc/150?u=david', isVerified: false, isFollower: false, viewedAt: Date.now() - 1000 * 60 * 30 }, // 30 min ago
  { username: 'sophia_garcia', displayName: 'Sophia Garcia', profilePic: 'https://i.pravatar.cc/150?u=sophia', isVerified: false, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 35 }, // 35 min ago
  { username: 'ryan_anderson', displayName: 'Ryan Anderson', profilePic: 'https://i.pravatar.cc/150?u=ryan', isVerified: false, isFollower: false, viewedAt: Date.now() - 1000 * 60 * 40 }, // 40 min ago
  { username: 'olivia_thomas', displayName: 'Olivia Thomas', profilePic: 'https://i.pravatar.cc/150?u=olivia', isVerified: true, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 45 }, // 45 min ago
  { username: 'nathan_white', displayName: 'Nathan White', profilePic: 'https://i.pravatar.cc/150?u=nathan', isVerified: false, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 50 }, // 50 min ago
  { username: 'mia_robinson', displayName: 'Mia Robinson', profilePic: 'https://i.pravatar.cc/150?u=mia', isVerified: false, isFollower: false, viewedAt: Date.now() - 1000 * 60 * 55 }, // 55 min ago
  { username: 'james_clark', displayName: 'James Clark', profilePic: 'https://i.pravatar.cc/150?u=james', isVerified: false, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 60 }, // 1 hour ago
  { username: 'ava_martinez', displayName: 'Ava Martinez', profilePic: 'https://i.pravatar.cc/150?u=ava', isVerified: true, isFollower: true, viewedAt: Date.now() - 1000 * 60 * 65 }, // 1h 5m ago
];

// Helper function to format time ago
const formatTimeAgo = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};

export default function MockInstagram() {
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [storylisterActive, setStoryListerActive] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [viewers, setViewers] = useState(new Map());
  const [currentFilters, setCurrentFilters] = useState({
    query: '',
    type: 'all',
    sort: 'recent',
    showTagged: false
  });
  
  // Load tags from localStorage
  const [taggedUsers, setTaggedUsers] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('storylister_tagged_users');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  
  // Save tags to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('storylister_tagged_users', JSON.stringify(Array.from(taggedUsers)));
  }, [taggedUsers]);

  // Pro mode toggle (for demo purposes)
  const [isProMode, setIsProMode] = useState(false);
  const [selectedCustomTag, setSelectedCustomTag] = useState('tagged');
  
  const customTags = [
    { id: 'tagged', emoji: '👀', label: 'Tagged' },
    { id: 'crush', emoji: '❤️', label: 'Crush' },
    { id: 'stalker', emoji: '🥷', label: 'Stalker' },
    { id: 'friend', emoji: '👯', label: 'Friend' },
    { id: 'work', emoji: '👮‍♂️', label: 'Work' }
  ];

  // Load the extension script when viewer modal opens
  useEffect(() => {
    if (showViewerModal && !storylisterActive) {
      // Simulate extension activation
      setTimeout(() => {
        setStoryListerActive(true);
        // Index mock viewers
        const viewerMap = new Map();
        mockViewers.forEach(viewer => {
          viewerMap.set(viewer.username, {
            ...viewer,
            isTagged: taggedUsers.has(viewer.username),
            indexedAt: Date.now(),
            lastSeen: Date.now()
          });
        });
        setViewers(viewerMap);
      }, 500);
    }
  }, [showViewerModal, storylisterActive, taggedUsers]);

  const toggleTag = (username: string) => {
    const newTaggedUsers = new Set(taggedUsers);
    if (newTaggedUsers.has(username)) {
      newTaggedUsers.delete(username);
    } else {
      newTaggedUsers.add(username);
    }
    setTaggedUsers(newTaggedUsers);
    
    // Update viewer
    const viewer = viewers.get(username);
    if (viewer) {
      viewer.isTagged = newTaggedUsers.has(username);
      setViewers(new Map(viewers));
    }
  };

  const getFilteredViewers = () => {
    let filteredViewers = Array.from(viewers.values());

    // Apply text search
    if (currentFilters.query) {
      const query = currentFilters.query.toLowerCase();
      filteredViewers = filteredViewers.filter(viewer => 
        viewer.username.toLowerCase().includes(query) ||
        viewer.displayName.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    switch (currentFilters.type) {
      case 'followers':
        filteredViewers = filteredViewers.filter(v => v.isFollower);
        break;
      case 'non-followers':
        filteredViewers = filteredViewers.filter(v => !v.isFollower);
        break;
      case 'verified':
        filteredViewers = filteredViewers.filter(v => v.isVerified);
        break;
    }

    // Apply tag filter
    if (currentFilters.showTagged) {
      filteredViewers = filteredViewers.filter(v => v.isTagged);
    }

    // Apply sorting
    switch (currentFilters.sort) {
      case 'alphabetical':
        filteredViewers.sort((a, b) => a.username.localeCompare(b.username));
        break;
      case 'recent':
        filteredViewers.sort((a, b) => a.viewedAt - b.viewedAt);
        break;
      case 'oldest':
        filteredViewers.sort((a, b) => b.viewedAt - a.viewedAt);
        break;
    }

    return filteredViewers;
  };

  // Calculate stats
  const totalViewers = viewers.size;
  const totalVerified = Array.from(viewers.values()).filter(v => v.isVerified).length;
  const taggedInCurrentStory = Array.from(viewers.values()).filter(v => v.isTagged).length;
  const totalTaggedUsers = taggedUsers.size;

  const exportData = () => {
    const data = getFilteredViewers().map(v => ({
      username: v.username,
      displayName: v.displayName,
      isVerified: v.isVerified,
      isFollower: v.isFollower,
      isTagged: v.isTagged,
      viewedAt: new Date(v.viewedAt).toISOString()
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUsernameClick = (username: string) => {
    // In a real extension, this would open the Instagram profile
    console.log(`Opening profile: @${username}`);
    alert(`Would open Instagram profile: @${username}`);
  };

  return (
    <div className="mock-instagram">
      {/* Instagram Header */}
      <div className="ig-header">
        <div className="ig-header-content">
          <div className="ig-logo">Instagram</div>
          <div className="ig-search">
            <input type="text" placeholder="Search" />
          </div>
          <div className="ig-nav-icons">
            <span className="ig-icon">🏠</span>
            <span className="ig-icon">💬</span>
            <span className="ig-icon">➕</span>
            <span className="ig-icon">❤️</span>
            <span className="ig-icon">👤</span>
          </div>
        </div>
      </div>

      {/* Story Viewer */}
      <div className="ig-story-viewer">
        <div className="ig-story-container">
          <div className="ig-story-header">
            <div className="ig-story-user">
              <img src="https://i.pravatar.cc/150?u=yourstory" alt="Your Story" />
              <span>yourusername</span>
              <span className="ig-story-time">2h</span>
            </div>
            <button className="ig-story-close">✕</button>
          </div>

          <div className="ig-story-content">
            <div className="ig-story-image">
              <div className="ig-story-placeholder">
                <h2>Your Story Content</h2>
                <p>This is a mock Instagram story viewer</p>
                <p>Click "Seen by" below to test Storylister</p>
              </div>
            </div>
          </div>

          <div className="ig-story-footer">
            <div className="ig-story-viewers" onClick={() => setShowViewerModal(true)}>
              <span className="ig-eye-icon">👁</span>
              <span>Seen by {mockViewers.length}</span>
            </div>
            <div className="ig-story-actions">
              <input type="text" placeholder="Send message" />
              <span className="ig-icon">❤️</span>
              <span className="ig-icon">📤</span>
            </div>
          </div>
        </div>
      </div>

      {/* Viewer Modal */}
      {showViewerModal && (
        <div className="ig-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowViewerModal(false);
        }}>
          <div className="ig-viewer-modal" role="dialog">
            <div className="ig-modal-header">
              <h3>Viewers</h3>
              <button onClick={() => setShowViewerModal(false)}>✕</button>
            </div>
            <div className="ig-viewer-list">
              {mockViewers.map(viewer => (
                <div key={viewer.username} className="ig-viewer-item" role="button">
                  <a 
                    href="#" 
                    className="ig-viewer-link"
                    onClick={(e) => {
                      e.preventDefault();
                      handleUsernameClick(viewer.username);
                    }}
                  >
                    <img 
                      src={viewer.profilePic} 
                      alt={viewer.username}
                      style={{ cursor: 'pointer' }}
                    />
                    <div className="ig-viewer-info">
                      <span className="ig-username">
                        {viewer.username}
                        {viewer.isVerified && <span className="ig-verified">✓</span>}
                      </span>
                      <span className="ig-display-name">
                        {viewer.displayName} · {formatTimeAgo(viewer.viewedAt)}
                      </span>
                    </div>
                  </a>
                  <button className="ig-follow-btn">
                    {viewer.isFollower ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Storylister Extension Panel */}
      {storylisterActive && showViewerModal && (
        <div id="storylister-right-rail">
          <div className="storylister-panel">
            <div className="storylister-header">
              <div className="storylister-logo">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>Storylister</span>
              </div>
              <div className="storylister-header-actions">
                <button 
                  className="storylister-pro-toggle"
                  onClick={() => setIsProMode(!isProMode)}
                  title={isProMode ? "Switch to Free mode" : "Switch to Pro mode (demo)"}
                >
                  {isProMode ? 'Pro' : 'Free'}
                </button>
                <button className="storylister-close" onClick={() => setStoryListerActive(false)}>×</button>
              </div>
            </div>
            
            <div className="storylister-content">
              {/* Stats Summary */}
              <div className="storylister-stats-summary">
                <div className="stat-item">
                  <span className="stat-label">Total Viewers</span>
                  <span className="stat-value">{totalViewers}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Verified</span>
                  <span className="stat-value">{totalVerified}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Tagged</span>
                  <span className="stat-value">{taggedInCurrentStory}/{totalTaggedUsers}</span>
                </div>
              </div>
              
              <div className="storylister-search">
                <input 
                  type="text" 
                  placeholder="Search viewers..." 
                  value={currentFilters.query}
                  onChange={(e) => setCurrentFilters({...currentFilters, query: e.target.value})}
                />
              </div>
              
              <div className="storylister-filters">
                <select 
                  value={currentFilters.type}
                  onChange={(e) => setCurrentFilters({...currentFilters, type: e.target.value})}
                >
                  <option value="all">All viewers</option>
                  <option value="followers">Followers only</option>
                  <option value="non-followers">Non-followers</option>
                  <option value="verified">Verified</option>
                </select>
                
                <select 
                  value={currentFilters.sort}
                  onChange={(e) => setCurrentFilters({...currentFilters, sort: e.target.value})}
                >
                  <option value="recent">Recent first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="alphabetical">A-Z</option>
                </select>
              </div>
              
              <div className="storylister-tag-controls">
                <label className="storylister-checkbox">
                  <input 
                    type="checkbox"
                    checked={currentFilters.showTagged}
                    onChange={(e) => setCurrentFilters({...currentFilters, showTagged: e.target.checked})}
                  />
                  <span>Show only tagged</span>
                </label>
                
                <button 
                  className="storylister-manage-tags"
                  onClick={() => setShowTagManager(!showTagManager)}
                >
                  Manage Tags
                </button>
              </div>
              
              <div className="storylister-stats">
                <span>{getFilteredViewers().length} viewers found</span>
                <div className="storylister-actions">
                  <button onClick={exportData}>📊 Export</button>
                </div>
              </div>
              
              <div className="storylister-results">
                {getFilteredViewers().map(viewer => (
                  <div key={viewer.username} className="storylister-viewer-item">
                    <div 
                      className="storylister-viewer-avatar"
                      onClick={() => handleUsernameClick(viewer.username)}
                      style={{ cursor: 'pointer' }}
                    >
                      <img src={viewer.profilePic} alt={viewer.username} />
                    </div>
                    <div className="storylister-viewer-info">
                      <div 
                        className="storylister-viewer-username"
                        onClick={() => handleUsernameClick(viewer.username)}
                        style={{ cursor: 'pointer' }}
                      >
                        {viewer.username}
                        {viewer.isVerified && <span className="storylister-verified">✓</span>}
                      </div>
                      <div className="storylister-viewer-meta">
                        {viewer.displayName} · {formatTimeAgo(viewer.viewedAt)}
                      </div>
                    </div>
                    <div className="storylister-viewer-tags">
                      {!isProMode ? (
                        // Free mode: Single "Tagged" button
                        <button
                          className={`storylister-tag ${viewer.isTagged ? 'active' : ''}`}
                          onClick={() => toggleTag(viewer.username)}
                          title="Tagged"
                        >
                          👀
                        </button>
                      ) : (
                        // Pro mode: Custom tag dropdown
                        <select 
                          className="storylister-tag-dropdown"
                          value={viewer.isTagged ? selectedCustomTag : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              if (!viewer.isTagged) toggleTag(viewer.username);
                              setSelectedCustomTag(e.target.value);
                            } else {
                              if (viewer.isTagged) toggleTag(viewer.username);
                            }
                          }}
                        >
                          <option value="">No tag</option>
                          {customTags.map(tag => (
                            <option key={tag.id} value={tag.id}>
                              {tag.emoji} {tag.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Tag Manager Modal */}
          {showTagManager && (
            <div className="storylister-tag-manager">
              <div className="tag-manager-header">
                <h3>Manage Tagged Users</h3>
                <button onClick={() => setShowTagManager(false)}>×</button>
              </div>
              <div className="tag-manager-content">
                <div className="tag-manager-stats">
                  <p>Total tagged users: {taggedUsers.size}</p>
                  <p>Tagged in this story: {taggedInCurrentStory}</p>
                </div>
                <div className="tag-manager-list">
                  {Array.from(taggedUsers).map(username => {
                    const viewer = viewers.get(username);
                    return (
                      <div key={username} className="tag-manager-item">
                        <span>{username}</span>
                        {viewer && <span className="tag-status">✓ In this story</span>}
                        <button 
                          className="tag-remove"
                          onClick={() => toggleTag(username)}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  {taggedUsers.size === 0 && (
                    <p className="tag-manager-empty">No tagged users yet</p>
                  )}
                </div>
                <div className="tag-manager-footer">
                  <button onClick={() => {
                    setTaggedUsers(new Set());
                    setViewers(new Map(
                      Array.from(viewers.entries()).map(([k, v]) => [k, {...v, isTagged: false}])
                    ));
                  }}>Clear All Tags</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}