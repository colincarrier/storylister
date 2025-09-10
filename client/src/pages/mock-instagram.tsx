import { useState, useEffect, useRef } from 'react';
import '@/styles/mock-instagram.css';

// Generate 100 mock users with varied characteristics
const generateMockUsers = () => {
  const firstNames = ['Sarah', 'Mike', 'Emma', 'Alex', 'Lisa', 'Chris', 'Jessica', 'David', 'Sophia', 'Ryan', 
                       'Olivia', 'Nathan', 'Mia', 'James', 'Ava', 'Daniel', 'Isabella', 'William', 'Emily', 'Mason',
                       'Charlotte', 'Ethan', 'Amelia', 'Michael', 'Harper', 'Benjamin', 'Evelyn', 'Jacob', 'Abigail', 'Lucas'];
  const lastNames = ['Johnson', 'Smith', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
                      'Anderson', 'Taylor', 'Thomas', 'Hernandez', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Lopez'];
  
  const users = [];
  for (let i = 0; i < 100; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}${Math.floor(Math.random() * 99)}`;
    
    users.push({
      username,
      displayName: `${firstName} ${lastName}`,
      profilePic: `https://i.pravatar.cc/150?u=${username}`,
      isVerified: Math.random() < 0.1, // 10% verified
      isFollower: Math.random() < 0.7, // 70% followers
      viewedAt: Date.now() - Math.floor(Math.random() * 1000 * 60 * 120) // Random time in last 2 hours
    });
  }
  
  return users.sort((a, b) => b.viewedAt - a.viewedAt); // Sort by most recent first
};

const mockUsers = generateMockUsers();

// Define which users watched which stories
const getStoryViewers = (storyIndex: number) => {
  // Story 1: 100% (all 100 users)
  // Story 2: 85% (first 85 users)
  // Story 3: 60% (first 60 users)
  const viewerCounts = [100, 85, 60];
  return mockUsers.slice(0, viewerCounts[storyIndex]);
};

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
  const [currentStory, setCurrentStory] = useState(0);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [storylisterActive, setStoryListerActive] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showViewerInsights, setShowViewerInsights] = useState(false);
  const [insightsTab, setInsightsTab] = useState('watchers');
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

  // Load viewers for current story when modal opens
  useEffect(() => {
    if (showViewerModal && !storylisterActive) {
      // Simulate extension activation
      setTimeout(() => {
        setStoryListerActive(true);
        // Index viewers for current story
        const storyViewers = getStoryViewers(currentStory);
        const viewerMap = new Map();
        storyViewers.forEach(viewer => {
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
  }, [showViewerModal, storylisterActive, taggedUsers, currentStory]);

  // Update viewers when story changes
  useEffect(() => {
    if (storylisterActive) {
      const storyViewers = getStoryViewers(currentStory);
      const viewerMap = new Map();
      storyViewers.forEach(viewer => {
        viewerMap.set(viewer.username, {
          ...viewer,
          isTagged: taggedUsers.has(viewer.username),
          indexedAt: Date.now(),
          lastSeen: Date.now()
        });
      });
      setViewers(viewerMap);
    }
  }, [currentStory, storylisterActive, taggedUsers]);

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
        filteredViewers.sort((a, b) => b.viewedAt - a.viewedAt);
        break;
      case 'oldest':
        filteredViewers.sort((a, b) => a.viewedAt - b.viewedAt);
        break;
    }

    return filteredViewers;
  };

  // Get insights data
  const getInsightsData = () => {
    const currentViewers = new Set(getStoryViewers(currentStory).map(v => v.username));
    const previousViewers = currentStory > 0 ? new Set(getStoryViewers(currentStory - 1).map(v => v.username)) : new Set();
    
    const watchers = Array.from(currentViewers).map(username => 
      mockUsers.find(u => u.username === username)!
    );
    
    const fellOff = Array.from(previousViewers).filter(username => !currentViewers.has(username as string))
      .map(username => mockUsers.find(u => u.username === username)!);
    
    const taggedInStory = Array.from(taggedUsers).filter(username => currentViewers.has(username))
      .map(username => mockUsers.find(u => u.username === username)!);
    
    const taggedNotInStory = Array.from(taggedUsers).filter(username => !currentViewers.has(username))
      .map(username => mockUsers.find(u => u.username === username)!);
    
    return { watchers, fellOff, taggedInStory, taggedNotInStory };
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
      viewedAt: new Date(v.viewedAt).toISOString(),
      story: currentStory + 1
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storylister_story${currentStory + 1}_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUsernameClick = (username: string) => {
    // In a real extension, this would open the Instagram profile
    console.log(`Opening profile: @${username}`);
    alert(`Would open Instagram profile: @${username}`);
  };

  const navigateStory = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentStory > 0) {
      setCurrentStory(currentStory - 1);
    } else if (direction === 'next' && currentStory < 2) {
      setCurrentStory(currentStory + 1);
    }
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
          {/* Story Progress Bars */}
          <div className="ig-story-progress">
            {[0, 1, 2].map(index => (
              <div 
                key={index} 
                className={`ig-progress-bar ${index === currentStory ? 'active' : ''} ${index < currentStory ? 'completed' : ''}`}
              />
            ))}
          </div>
          
          <div className="ig-story-header">
            <div className="ig-story-user">
              <img src="https://i.pravatar.cc/150?u=yourstory" alt="Your Story" />
              <span>yourusername</span>
              <span className="ig-story-time">2h</span>
            </div>
            <button className="ig-story-close">✕</button>
          </div>

          {/* Navigation Arrows */}
          {currentStory > 0 && (
            <button className="ig-story-nav ig-story-nav-prev" onClick={() => navigateStory('prev')}>
              ‹
            </button>
          )}
          {currentStory < 2 && (
            <button className="ig-story-nav ig-story-nav-next" onClick={() => navigateStory('next')}>
              ›
            </button>
          )}

          <div className="ig-story-content">
            <div className="ig-story-image">
              <div className="ig-story-placeholder">
                <h2>Story {currentStory + 1} of 3</h2>
                <p>This is story #{currentStory + 1}</p>
                <div className="story-stats">
                  <p>{getStoryViewers(currentStory).length} viewers</p>
                  {currentStory > 0 && (
                    <p className="drop-off-stat">
                      {100 - Math.round(getStoryViewers(currentStory).length / getStoryViewers(0).length * 100)}% drop-off from Story 1
                    </p>
                  )}
                </div>
                <p className="story-hint">Click "Seen by" below to test Storylister</p>
              </div>
            </div>
          </div>

          <div className="ig-story-footer">
            <div className="ig-story-viewers" onClick={() => setShowViewerModal(true)}>
              <span className="ig-eye-icon">👁</span>
              <span>Seen by {getStoryViewers(currentStory).length}</span>
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
              {getStoryViewers(currentStory).map(viewer => (
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
              {/* Current Story Indicator */}
              <div className="storylister-story-indicator">
                Analyzing Story {currentStory + 1} of 3
              </div>
              
              {/* Stats Summary */}
              <div className="storylister-stats-summary">
                <div className="stat-item">
                  <span className="stat-label">Viewers</span>
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
              
              {/* Viewer Insights Button */}
              <button 
                className="storylister-insights-btn"
                onClick={() => setShowViewerInsights(true)}
              >
                📊 Viewer Insights
              </button>
              
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
          
          {/* Viewer Insights Modal */}
          {showViewerInsights && (
            <div className="viewer-insights-modal">
              <div className="insights-header">
                <h3>Viewer Insights - Story {currentStory + 1}</h3>
                <button onClick={() => setShowViewerInsights(false)}>×</button>
              </div>
              
              <div className="insights-tabs">
                <button 
                  className={`insights-tab ${insightsTab === 'watchers' ? 'active' : ''}`}
                  onClick={() => setInsightsTab('watchers')}
                >
                  Watchers ({getInsightsData().watchers.length})
                </button>
                <button 
                  className={`insights-tab ${insightsTab === 'fell-off' ? 'active' : ''} ${currentStory === 0 ? 'disabled' : ''}`}
                  onClick={() => currentStory > 0 && setInsightsTab('fell-off')}
                  disabled={currentStory === 0}
                >
                  Fell-off ({currentStory > 0 ? getInsightsData().fellOff.length : 0})
                </button>
                <button 
                  className={`insights-tab ${insightsTab === 'tagged' ? 'active' : ''}`}
                  onClick={() => setInsightsTab('tagged')}
                >
                  Tagged ({getInsightsData().taggedInStory.length}/{taggedUsers.size})
                </button>
              </div>
              
              <div className="insights-content">
                {insightsTab === 'watchers' && (
                  <div className="insights-list">
                    <p className="insights-description">Users who viewed this story</p>
                    {getInsightsData().watchers.map(user => (
                      <div key={user.username} className="insights-user">
                        <img src={user.profilePic} alt={user.username} />
                        <div className="insights-user-info">
                          <span className="insights-username">
                            {user.username}
                            {user.isVerified && <span className="storylister-verified">✓</span>}
                          </span>
                          <span className="insights-meta">{user.displayName}</span>
                        </div>
                        {taggedUsers.has(user.username) && <span className="insights-tag">👀</span>}
                      </div>
                    ))}
                  </div>
                )}
                
                {insightsTab === 'fell-off' && (
                  <div className="insights-list">
                    <p className="insights-description">Users who watched Story {currentStory} but not this one</p>
                    {getInsightsData().fellOff.length > 0 ? (
                      getInsightsData().fellOff.map(user => (
                        <div key={user.username} className="insights-user fell-off">
                          <img src={user.profilePic} alt={user.username} />
                          <div className="insights-user-info">
                            <span className="insights-username">
                              {user.username}
                              {user.isVerified && <span className="storylister-verified">✓</span>}
                            </span>
                            <span className="insights-meta">{user.displayName}</span>
                          </div>
                          {taggedUsers.has(user.username) && <span className="insights-tag">👀</span>}
                        </div>
                      ))
                    ) : (
                      <p className="insights-empty">No users fell off at this story</p>
                    )}
                  </div>
                )}
                
                {insightsTab === 'tagged' && (
                  <div className="insights-list">
                    <p className="insights-description">Your tagged users and their viewing status</p>
                    {getInsightsData().taggedInStory.length > 0 && (
                      <>
                        <h4 className="insights-subheader">Watched this story</h4>
                        {getInsightsData().taggedInStory.map(user => (
                          <div key={user.username} className="insights-user">
                            <img src={user.profilePic} alt={user.username} />
                            <div className="insights-user-info">
                              <span className="insights-username">
                                {user.username}
                                {user.isVerified && <span className="storylister-verified">✓</span>}
                              </span>
                              <span className="insights-meta">{user.displayName}</span>
                            </div>
                            <span className="insights-status watched">✓ Watched</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {getInsightsData().taggedNotInStory.length > 0 && (
                      <>
                        <h4 className="insights-subheader">Haven't watched this story</h4>
                        {getInsightsData().taggedNotInStory.map(user => (
                          <div key={user.username} className="insights-user not-watched">
                            <img src={user.profilePic} alt={user.username} />
                            <div className="insights-user-info">
                              <span className="insights-username">
                                {user.username}
                                {user.isVerified && <span className="storylister-verified">✓</span>}
                              </span>
                              <span className="insights-meta">{user.displayName}</span>
                            </div>
                            <span className="insights-status not-watched">Not watched</span>
                          </div>
                        ))}
                      </>
                    )}
                    
                    {taggedUsers.size === 0 && (
                      <p className="insights-empty">No tagged users yet</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}