import { useState, useEffect } from 'react';
import '@/styles/extension-preview.css';

// Mock viewer data matching Instagram
const mockViewers = [
  { username: 'heywhatsuphello', displayName: 'Alex Haughler', profilePic: 'https://i.pravatar.cc/150?u=alex1', isVerified: true, timeAgo: '43m ago' },
  { username: 'adamksay', displayName: 'Adam Kay', profilePic: 'https://i.pravatar.cc/150?u=adam2', isVerified: false, timeAgo: '1h ago' },
  { username: 'nadineiihouian', displayName: 'Nadine', profilePic: 'https://i.pravatar.cc/150?u=nadine3', isVerified: false, timeAgo: '1h ago' },
  { username: 'glacierfox', displayName: 'Glacier', profilePic: 'https://i.pravatar.cc/150?u=glacier4', isVerified: false, timeAgo: '1h ago' },
  { username: 'evolvewithmelvin', displayName: '', profilePic: 'https://i.pravatar.cc/150?u=melvin5', isVerified: true, timeAgo: '45m ago' },
  { username: 'dinasahlm', displayName: '', profilePic: 'https://i.pravatar.cc/150?u=dina6', isVerified: false, timeAgo: '43m ago' },
  { username: 'notanele', displayName: '', profilePic: 'https://i.pravatar.cc/150?u=anele7', isVerified: false, timeAgo: '8m ago' },
  { username: 'michelle_porsey', displayName: 'Michelle Porsey', profilePic: 'https://i.pravatar.cc/150?u=michelle8', isVerified: false, timeAgo: '1h ago' },
  { username: 'creativeware', displayName: '', profilePic: 'https://i.pravatar.cc/150?u=creative9', isVerified: true, timeAgo: '1h ago' },
  { username: 'alexsherman_', displayName: '', profilePic: 'https://i.pravatar.cc/150?u=alex10', isVerified: false, timeAgo: '2h ago' },
];

// Generate more viewers for testing
for (let i = 11; i <= 100; i++) {
  mockViewers.push({
    username: `user${i}`,
    displayName: Math.random() > 0.5 ? `User ${i}` : '',
    profilePic: `https://i.pravatar.cc/150?u=user${i}`,
    isVerified: Math.random() > 0.8,
    timeAgo: `${Math.floor(Math.random() * 24)}h ago`
  });
}

export default function ExtensionPreview() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('following');
  const [taggedUsers, setTaggedUsers] = useState<Set<string>>(new Set());
  const [showTagManager, setShowTagManager] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [currentStory, setCurrentStory] = useState(0);
  const [insightsTab, setInsightsTab] = useState('watchers');

  const filteredViewers = mockViewers.filter(viewer => {
    if (searchQuery && !viewer.username.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (activeFilter === 'verified' && !viewer.isVerified) {
      return false;
    }
    if (activeFilter === 'tagged' && !taggedUsers.has(viewer.username)) {
      return false;
    }
    return true;
  });

  const verifiedCount = mockViewers.filter(v => v.isVerified).length;
  const taggedCount = mockViewers.filter(v => taggedUsers.has(v.username)).length;

  const toggleTag = (username: string) => {
    const newTagged = new Set(taggedUsers);
    if (newTagged.has(username)) {
      newTagged.delete(username);
    } else {
      newTagged.add(username);
    }
    setTaggedUsers(newTagged);
  };

  return (
    <div className="extension-preview-container">
      <div className="instagram-mockup">
        <div className="instagram-header">Instagram Story View</div>
        <div className="instagram-story">
          <img src="https://picsum.photos/400/700" alt="Story" />
          <div className="story-bottom">
            <span>Seen by {mockViewers.length}</span>
          </div>
        </div>
      </div>

      {/* This is the exact extension panel */}
      <div className="storylister-extension-panel">
        <div className="storylister-header">
          <div className="storylister-logo">
            <span className="logo-icon">👁️</span>
            <span>Storylister</span>
          </div>
          <button className="storylister-close">×</button>
        </div>

        <div className="storylister-pro-toggle">
          <label className="pro-switch">
            <input type="checkbox" />
            <span className="slider"></span>
          </label>
          <span className="pro-label">Free</span>
        </div>

        <div className="storylister-stats">
          <div className="stat-card">
            <div className="stat-label">VIEWERS</div>
            <div className="stat-value">{mockViewers.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">VERIFIED</div>
            <div className="stat-value">{verifiedCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">TAGGED</div>
            <div className="stat-value">{taggedCount}/{taggedUsers.size}</div>
          </div>
        </div>

        <div className="storylister-content">
          <div className="storylister-search-section">
            <h3>Search Viewers</h3>
            <input
              type="text"
              placeholder="Search by username or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="storylister-filters">
            <button 
              className={`filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All
            </button>
            <button 
              className={`filter-tab ${activeFilter === 'verified' ? 'active' : ''}`}
              onClick={() => setActiveFilter('verified')}
            >
              ✓ Verified ({verifiedCount})
            </button>
            <button 
              className={`filter-tab ${activeFilter === 'tagged' ? 'active' : ''}`}
              onClick={() => setActiveFilter('tagged')}
            >
              👀 Tagged ({taggedUsers.size})
            </button>
          </div>

          <div className="storylister-tabs">
            <button 
              className={`tab-btn ${activeTab === 'following' ? 'active' : ''}`}
              onClick={() => setActiveTab('following')}
            >
              Following
            </button>
            <button 
              className={`tab-btn ${activeTab === 'followers' ? 'active' : ''}`}
              onClick={() => setActiveTab('followers')}
            >
              Followers
            </button>
            <button 
              className={`tab-btn ${activeTab === 'non-followers' ? 'active' : ''}`}
              onClick={() => setActiveTab('non-followers')}
            >
              Non-followers
            </button>
          </div>

          <div className="storylister-results">
            <div className="storylister-results-header">
              <span>{filteredViewers.length} viewers found</span>
              <button className="storylister-newest">↓ Newest</button>
            </div>
            {filteredViewers.map(viewer => (
              <div key={viewer.username} className="storylister-viewer-item">
                <div className="storylister-viewer-left">
                  <img 
                    src={viewer.profilePic} 
                    alt={viewer.username}
                    className="viewer-avatar"
                  />
                  <div className="storylister-viewer-info">
                    <div className="storylister-viewer-name">
                      {viewer.username}
                      {viewer.isVerified && (
                        <svg className="verified-badge" viewBox="0 0 24 24">
                          <path fill="#1877F2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                      )}
                    </div>
                    <div className="storylister-viewer-meta">
                      {viewer.displayName && `${viewer.displayName} · `}{viewer.timeAgo}
                    </div>
                  </div>
                </div>
                <div className="storylister-viewer-actions">
                  <button className="viewer-action-btn">👁️</button>
                  <button 
                    className={`viewer-tag-btn ${taggedUsers.has(viewer.username) ? 'active' : ''}`}
                    onClick={() => toggleTag(viewer.username)}
                  >
                    👀
                  </button>
                  <button className="viewer-action-btn">⋯</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="storylister-footer">
          <button 
            className="storylister-btn secondary"
            onClick={() => setShowTagManager(true)}
          >
            👀 Manage Tags
          </button>
          <button 
            className="storylister-btn primary"
            onClick={() => setShowInsights(true)}
          >
            📊 Export &<br />Track
          </button>
        </div>
      </div>
    </div>
  );
}