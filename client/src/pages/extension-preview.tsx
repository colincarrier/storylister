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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [taggedUsers, setTaggedUsers] = useState<Set<string>>(new Set());
  const [showTagManager, setShowTagManager] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  const filteredViewers = mockViewers.filter(viewer => {
    if (searchQuery && !viewer.username.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (categoryFilter === 'verified' && !viewer.isVerified) {
      return false;
    }
    if (tagFilter === 'tagged' && !taggedUsers.has(viewer.username)) {
      return false;
    }
    return true;
  });

  const verifiedCount = mockViewers.filter(v => v.isVerified).length;
  const taggedCount = taggedUsers.size;

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

      {/* Exact copy of mock-instagram's Storylister panel */}
      <div id="storylister-right-rail">
        <div className="storylister-panel">
          <div className="storylister-header">
            <div className="storylister-logo">
              <span>👁️ Storylister</span>
            </div>
            <div className="storylister-header-actions">
              <button className="storylister-pro-toggle">
                PRO - Track Analytics
              </button>
              <button className="storylister-close">×</button>
            </div>
          </div>

          <div className="storylister-content">
            <div className="storylister-search-section">
              <input
                type="text"
                placeholder="Search viewers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="storylister-filters">
              <select 
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All viewers</option>
                <option value="following">Following</option>
                <option value="followers">Followers</option>
                <option value="verified">Verified ({verifiedCount})</option>
              </select>
              <select>
                <option>Recently viewed</option>
                <option>Most engaged</option>
                <option>New viewers</option>
              </select>
            </div>

            {taggedUsers.size > 0 && (
              <div className="storylister-tag-filter">
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="all">All viewers</option>
                  <option value="tagged">👀 Tagged viewers ({taggedUsers.size})</option>
                </select>
              </div>
            )}

            <div className="storylister-stats">
              <span>
                Showing {filteredViewers.length} of {mockViewers.length} viewers
              </span>
              <div className="storylister-actions">
                <button onClick={() => setShowTagManager(true)}>👀 Manage Tags</button>
                <button onClick={() => setShowInsights(true)}>📊 Export</button>
              </div>
            </div>

            <div className="storylister-results">
              {filteredViewers.map(viewer => (
                <div key={viewer.username} className="storylister-viewer-item">
                  <div className="storylister-viewer-avatar">
                    <img src={viewer.profilePic} alt={viewer.username} />
                  </div>
                  <div className="storylister-viewer-info">
                    <div className="storylister-viewer-username">
                      {viewer.username}
                      {viewer.isVerified && (
                        <span className="storylister-verified">✓</span>
                      )}
                    </div>
                    {viewer.displayName && (
                      <div className="storylister-viewer-display-name">
                        {viewer.displayName}
                      </div>
                    )}
                  </div>
                  <div className="storylister-viewer-tags">
                    <button 
                      className={`storylister-tag ${taggedUsers.has(viewer.username) ? 'active' : ''}`}
                      onClick={() => toggleTag(viewer.username)}
                    >
                      👀
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="storylister-footer">
            <button className="storylister-btn secondary">
              👀 Manage Tags
            </button>
            <button className="storylister-btn primary">
              📊 Analytics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}