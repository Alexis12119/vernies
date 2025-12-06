import React, { useState, useEffect } from 'react';
import  api  from '../services/api';

const NotificationPreferences = ({ onClose }) => {
  const [preferences, setPreferences] = useState({
    low_stock_alerts: true,
    system_alerts: true,
    email_notifications: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await api.get('/notification-preferences');
      setPreferences(response.data);
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      await api.put('/notification-preferences', preferences);
      alert('Notification preferences saved successfully!');
      onClose();
    } catch (error) {
      alert('Failed to save preferences: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 shadow-lg">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Notification Preferences</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900">Low Stock Alerts</label>
              <p className="text-sm text-gray-500">Get notified when items have 10 or less units</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.low_stock_alerts}
              onChange={(e) => setPreferences({...preferences, low_stock_alerts: e.target.checked})}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-900">System Alerts</label>
              <p className="text-sm text-gray-500">Receive system notifications and updates</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.system_alerts}
              onChange={(e) => setPreferences({...preferences, system_alerts: e.target.checked})}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={savePreferences}
            disabled={saving}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPreferences;
