import { useState, useEffect, useRef } from 'react';
import '@/styles/mock-instagram.css';

// Mock viewer data
const mockViewers = [
  { username: 'sarah_jones', displayName: 'Sarah Jones', profilePic: 'https://i.pravatar.cc/150?u=sarah', isVerified: true, isFollower: true },
  { username: 'mike_wilson', displayName: 'Mike Wilson', profilePic: 'https://i.pravatar.cc/150?u=mike', isVerified: false, isFollower: true },
  { username: 'emma_davis', displayName: 'Emma Davis', profilePic: 'https://i.pravatar.cc/150?u=emma', isVerified: false, isFollower: false },
  { username: 'alex_martin', displayName: 'Alex Martin', profilePic: 'https://i.pravatar.cc/150?u=alex', isVerified: true, isFollower: true },
  { username: 'lisa_brown', displayName: 'Lisa Brown', profilePic: 'https://i.pravatar.cc/150?u=lisa', isVerified: false, isFollower: false },
  { username: 'chris_taylor', displayName: 'Chris Taylor', profilePic: 'https://i.pravatar.cc/150?u=chris', isVerified: false, isFollower: true },
  { username: 'jessica_lee', displayName: 'Jessica Lee', profilePic: 'https://i.pravatar.cc/150?u=jessica', isVerified: true, isFollower: true },
  { username: 'david_smith', displayName: 'David Smith', profilePic: 'https://i.pravatar.cc/150?u=david', isVerified: false, isFollower: false },
  { username: 'sophia_garcia', displayName: 'Sophia Garcia', profilePic: 'https://i.pravatar.cc/150?u=sophia', isVerified: false, isFollower: true },
  { username: 'ryan_anderson', displayName: 'Ryan Anderson', profilePic: 'https://i.pravatar.cc/150?u=ryan', isVerified: false, isFollower: false },
  { username: 'olivia_thomas', displayName: 'Olivia Thomas', profilePic: 'https://i.pravatar.cc/150?u=olivia', isVerified: true, isFollower: true },
  { username: 'nathan_white', displayName: 'Nathan White', profilePic: 'https://i.pravatar.cc/150?u=nathan', isVerified: false, isFollower: true },
  { username: 'mia_robinson', displayName: 'Mia Robinson', profilePic: 'https://i.pravatar.cc/150?u=mia', isVerified: false, isFollower: false },
  { username: 'james_clark', displayName: 'James Clark', profilePic: 'https://i.pravatar.cc/150?u=james', isVerified: false, isFollower: true },
  { username: 'ava_martinez', displayName: 'Ava Martinez', profilePic: 'https://i.pravatar.cc/150?u=ava', isVerified: true, isFollower: true },
];

export default function MockInstagram() {
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [storylisterActive, setStoryListerActive] = useState(false);
  const [viewers, setViewers] = useState(new Map());
  const [currentFilters, setCurrentFilters] = useState({
    query: '',
    type: 'all',
    sort: 'recent',
    tag: 'all'
  });
  const [tags, setTags] = useState<{[key: string]: string[]}>({});
  const contentScriptRef = useRef<any>(null);

  const availableTags = [
    { emoji: '❤️', label: 'Crush', id: 'crush' },
    { emoji: '🥷', label: 'Stalker', id: 'stalker' },
    { emoji: '👯', label: 'Friend', id: 'friend' },
    { emoji: '👮‍♂️', label: 'Work', id: 'work' }
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
            tags: tags[viewer.username] || [],
            indexedAt: Date.now(),
            lastSeen: Date.now()
          });
        });
        setViewers(viewerMap);
      }, 500);
    }
  }, [showViewerModal, storylisterActive, tags]);

  const toggleTag = (username: string, tagId: string) => {
    const userTags = tags[username] || [];
    const tagIndex = userTags.indexOf(tagId);
    
    if (tagIndex > -1) {
      userTags.splice(tagIndex, 1);
    } else {
      userTags.push(tagId);
    }
    
    setTags({ ...tags, [username]: userTags });
    
    // Update viewer
    const viewer = viewers.get(username);
    if (viewer) {
      viewer.tags = userTags;
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
    switch (currentFilters.tag) {
      case 'all':
        break;
      case 'untagged':
        filteredViewers = filteredViewers.filter(v => !v.tags || v.tags.length === 0);
        break;
      default:
        filteredViewers = filteredViewers.filter(v => v.tags && v.tags.includes(currentFilters.tag));
        break;
    }

    // Apply sorting
    switch (currentFilters.sort) {
      case 'alphabetical':
        filteredViewers.sort((a, b) => a.username.localeCompare(b.username));
        break;
      case 'recent':
        filteredViewers.sort((a, b) => b.indexedAt - a.indexedAt);
        break;
    }

    return filteredViewers;
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
                  <a href={`#${viewer.username}`} className="ig-viewer-link">
                    <img src={viewer.profilePic} alt={viewer.username} />
                    <div className="ig-viewer-info">
                      <span className="ig-username">
                        {viewer.username}
                        {viewer.isVerified && <span className="ig-verified">✓</span>}
                      </span>
                      <span className="ig-display-name">{viewer.displayName}</span>
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
              <button className="storylister-close" onClick={() => setStoryListerActive(false)}>×</button>
            </div>
            
            <div className="storylister-content">
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
                  <option value="alphabetical">A-Z</option>
                  <option value="active">Most active</option>
                </select>
              </div>
              
              <div className="storylister-tag-filter">
                <select 
                  value={currentFilters.tag}
                  onChange={(e) => setCurrentFilters({...currentFilters, tag: e.target.value})}
                >
                  <option value="all">All tags</option>
                  <option value="crush">❤️ Crush</option>
                  <option value="stalker">🥷 Stalker</option>
                  <option value="friend">👯 Friend</option>
                  <option value="work">👮‍♂️ Work</option>
                  <option value="untagged">No tags</option>
                </select>
              </div>
              
              <div className="storylister-stats">
                <span>{getFilteredViewers().length} viewers found</span>
                <div className="storylister-actions">
                  <button>📸 Capture</button>
                  <button>📊 Export</button>
                </div>
              </div>
              
              <div className="storylister-results">
                {getFilteredViewers().map(viewer => (
                  <div key={viewer.username} className="storylister-viewer-item">
                    <div className="storylister-viewer-avatar">
                      <img src={viewer.profilePic} alt={viewer.username} />
                    </div>
                    <div className="storylister-viewer-info">
                      <div className="storylister-viewer-username">
                        {viewer.username}
                        {viewer.isVerified && <span className="storylister-verified">✓</span>}
                      </div>
                      <div className="storylister-viewer-display-name">{viewer.displayName}</div>
                    </div>
                    <div className="storylister-viewer-tags">
                      {availableTags.map(tag => (
                        <button
                          key={tag.id}
                          className={`storylister-tag ${viewer.tags?.includes(tag.id) ? 'active' : ''}`}
                          onClick={() => toggleTag(viewer.username, tag.id)}
                          title={tag.label}
                        >
                          {tag.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}