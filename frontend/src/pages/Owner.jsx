import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { productAPI, salesAPI, inventoryAPI, branchAPI, userAPI, activityAPI, authAPI } from '../services/api';

const Owner = () => {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'cashier', branch_id: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, inventoryRes, salesRes, branchesRes, usersRes, activityRes] = await Promise.all([
        productAPI.getProducts(),
        inventoryAPI.getInventory(),
        salesAPI.getSales(),
        branchAPI.getBranches(),
        userAPI.getUsers(),
        activityAPI.getActivityLogs()
      ]);
      setProducts(productsRes.data);
      setInventory(inventoryRes.data);
      setSales(salesRes.data);
      setBranches(branchesRes.data);
      setUsers(usersRes.data);
      setActivityLogs(activityRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTodaySales = () => {
    const today = new Date().toDateString();
    return sales.filter(sale => 
      new Date(sale.created_at).toDateString() === today
    );
  };

  const getBranchSalesData = () => {
    return branches.map(branch => {
      const branchSales = sales.filter(sale => sale.branch_id === branch.id);
      const todayBranchSales = branchSales.filter(sale => 
        new Date(sale.created_at).toDateString() === new Date().toDateString()
      );
      
      return {
        ...branch,
        totalSales: branchSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0),
        todaySales: todayBranchSales.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0),
        transactionCount: todayBranchSales.length
      };
    });
  };

  const createUser = async () => {
    try {
      await authAPI.register(newUser);
      setNewUser({ email: '', password: '', role: 'cashier', branch_id: '' });
      fetchData();
      alert('User created successfully!');
    } catch (error) {
      alert('Failed to create user: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateInventory = async (productId, branchId, newStock) => {
    try {
      await inventoryAPI.updateInventory({
        product_id: productId,
        branch_id: branchId,
        stock: newStock
      });
      fetchData();
      alert('Inventory updated successfully!');
    } catch (error) {
      alert('Failed to update inventory: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  const branchSalesData = getBranchSalesData();
  const todaySales = getTodaySales();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
              <p className="text-sm text-gray-500">System Overview</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex space-x-4 border-b">
            {['overview', 'branches', 'inventory', 'users', 'products', 'transactions', 'activity'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-2">Today's Sales</h3>
                <p className="text-3xl font-bold text-green-600">
                  ${todaySales.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">{todaySales.length} transactions</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-2">Total Branches</h3>
                <p className="text-3xl font-bold text-blue-600">{branches.length}</p>
                <p className="text-sm text-gray-500">Active locations</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-2">Total Products</h3>
                <p className="text-3xl font-bold text-purple-600">{products.length}</p>
                <p className="text-sm text-gray-500">In catalog</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-2">Total Users</h3>
                <p className="text-3xl font-bold text-orange-600">{users.length}</p>
                <p className="text-sm text-gray-500">System users</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Branch Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Today's Sales</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transactions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {branchSalesData.map(branch => (
                      <tr key={branch.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{branch.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">${branch.todaySales.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">${branch.totalSales.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{branch.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'branches' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Branch Management</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Today's Sales</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {branchSalesData.map(branch => {
                    const branchUsers = users.filter(user => user.branch_id === branch.id);
                    return (
                      <tr key={branch.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{branch.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap">${branch.todaySales.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">${branch.totalSales.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{branchUsers.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Global Inventory</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inventory.map(item => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{item.product_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{item.branch_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.stock < 10 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {item.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">${item.price}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded"
                          defaultValue={item.stock}
                          onBlur={(e) => updateInventory(item.product_id, item.branch_id, parseInt(e.target.value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Create New User</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input
                  type="email"
                  placeholder="Email"
                  className="px-4 py-2 border rounded"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="px-4 py-2 border rounded"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                />
                <select
                  className="px-4 py-2 border rounded"
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                >
                  <option value="cashier">Cashier</option>
                  <option value="branch_admin">Branch Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <div className="flex space-x-2">
                  <select
                    className="flex-1 px-4 py-2 border rounded"
                    value={newUser.branch_id}
                    onChange={(e) => setNewUser({...newUser, branch_id: e.target.value})}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={createUser}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">System Users</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {users.map(user => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs ${
                            user.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'branch_admin' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{user.branch_name || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Product Catalog</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map(product => {
                    const totalStock = inventory
                      .filter(item => item.product_id === product.id)
                      .reduce((sum, item) => sum + item.stock, 0);
                    
                    return (
                      <tr key={product.id}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{product.name}</td>
                        <td className="px-6 py-4">{product.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap">${product.price}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{totalStock}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">All Transactions</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cashier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sales.map(sale => (
                    <tr key={sale.id}>
                      <td className="px-6 py-4 whitespace-nowrap">#{sale.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{sale.branch_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{sale.cashier_email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">${parseFloat(sale.total_amount).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(sale.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Activity Logs</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activityLogs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{log.user_email}</td>
                      <td className="px-6 py-4">{log.action}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Owner;