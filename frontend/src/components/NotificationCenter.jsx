import React, { useState, useEffect } from 'react';
import api from '../services/api';
import NotificationPreferences from './NotificationPreferences';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    fetchNotifications();
    
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      const newNotifications = response.data;
      
      // Filter out duplicates
      const filteredNotifications = newNotifications.filter(newNotif => 
        !isDuplicateNotification(newNotif, notifications)
      );
      
      setNotifications(prev => [...filteredNotifications, ...prev].slice(0, 50)); // Keep only latest 50
      const unread = newNotifications.filter(n => !n.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await api.post(`/notifications/${notificationId}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  // Prevent duplicate notifications by checking if notification already exists
  const isDuplicateNotification = (newNotification, existingNotifications) => {
    return existingNotifications.some(existing => 
      existing.title === newNotification.title && 
      existing.message === newNotification.message &&
      existing.type === newNotification.type &&
      Math.abs(new Date(existing.created_at) - new Date(newNotification.created_at)) < 60000 // Within 1 minute
    );
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'low_stock':
        return '🔴';
      case 'system':
        return '⚙️';
      default:
        return 'ℹ️';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Mark all as read
                  </button>
                )}
                <button
                  onClick={() => setShowPreferences(true)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                  title="Notification Settings"
                >
                  ⚙️
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                    !notification.is_read ? 'bg-orange-50' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start space-x-3">
                    <span className="text-xl">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.is_read ? 'font-semibold' : 'font-medium'} text-gray-900`}>
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDate(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showPreferences && (
        <NotificationPreferences onClose={() => setShowPreferences(false)} />
      )}
    </div>
  );
};

export default NotificationCenter;
