import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { productAPI, salesAPI, inventoryAPI } from '../services/api';
import NotificationCenter from '../components/NotificationCenter';

const BranchAdmin = () => {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, inventoryRes, salesRes] = await Promise.all([
        productAPI.getProducts(),
        inventoryAPI.getInventory(),
        salesAPI.getSales()
      ]);
      setProducts(productsRes.data);
      setInventory(inventoryRes.data);
      setSales(salesRes.data);
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

  const getTotalSales = () => {
    return getTodaySales().reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0);
  };

  const updateInventory = async (productId, newStock) => {
    try {
      await inventoryAPI.updateInventory({
        product_id: productId,
        branch_id: user.branch_id,
        stock: newStock
      });
      fetchData();
      alert('Inventory updated successfully!');
    } catch (error) {
      alert('Failed to update inventory: ' + (error.response?.data?.error || error.message));
    }
  };

  const addProduct = async () => {
    try {
      await productAPI.createProduct(newProduct);
      setNewProduct({ name: '', description: '', price: '' });
      fetchData();
      alert('Product added successfully!');
    } catch (error) {
      alert('Failed to add product: ' + (error.response?.data?.error || error.message));
    }
  };

  const updateProduct = async (productId, productData) => {
    try {
      console.log('Updating product:', productId, productData);
      await productAPI.updateProduct(productId, productData);
      setEditingProduct(null);
      fetchData();
      alert('Product updated successfully!');
    } catch (error) {
      alert('Failed to update product: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteProduct = async (productId) => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }
    
    try {
      await productAPI.deleteProduct(productId);
      fetchData();
      alert('Product deleted successfully!');
    } catch (error) {
      alert('Failed to delete product: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  const branchInventory = inventory.filter(item => item.branch_id === user.branch_id);
  const branchSales = sales.filter(sale => sale.branch_id === user.branch_id);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center space-x-3">
                <img 
                  src="/logo.png" 
                  alt="Vernie's Shopping Plaza"
                  className="h-16 w-auto"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Branch Admin Dashboard</h1>
                  <p className="text-sm text-gray-500">Branch: {user.branch_id || 'Not assigned'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <NotificationCenter />
                <button
                  onClick={logout}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex space-x-4 border-b">
            {['overview', 'inventory', 'products', 'transactions'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'text-orange-600 border-b-2 border-orange-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">Today's Sales</h3>
              <p className="text-3xl font-bold text-green-600">₱ {getTotalSales().toFixed(2)}</p>
              <p className="text-sm text-gray-500">{getTodaySales().length} transactions</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">Total Products</h3>
              <p className="text-3xl font-bold text-blue-600">{branchInventory.length}</p>
              <p className="text-sm text-gray-500">In inventory</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">Low Stock Items</h3>
              <p className="text-3xl font-bold text-blue-600">
                {branchInventory.filter(item => item.stock < 10).length}
              </p>
              <p className="text-sm text-gray-500">Need restocking</p>
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Inventory Management</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {branchInventory.map(item => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{item.product_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱ {item.price}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.stock < 10 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {item.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          className="w-20 px-2 py-1 border rounded"
                          defaultValue={item.stock}
                          onBlur={(e) => updateInventory(item.product_id, parseInt(e.target.value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Add New Product</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  placeholder="Product name"
                  className="px-4 py-2 border rounded"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Description"
                  className="px-4 py-2 border rounded"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                />
                <div className="flex space-x-2">
                  <input
                    type="number"
                    placeholder="Price"
                    className="flex-1 px-4 py-2 border rounded"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                  />
                  <button
                    onClick={addProduct}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Products</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map(product => (
                      <tr key={product.id}>
                        <td className="px-6 py-4 whitespace-nowrap">{product.name}</td>
                        <td className="px-6 py-4">{product.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap">₱ {product.price}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setEditingProduct(product)}
                              className="text-orange-600 hover:text-orange-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteProduct(product.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Transaction History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sale ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cashier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {branchSales.map(sale => (
                    <tr key={sale.id}>
                      <td className="px-6 py-4 whitespace-nowrap">#{sale.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{sale.cashier_email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">₱ {parseFloat(sale.total_amount).toFixed(2)}</td>
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

        {/* Edit Product Modal */}
        {editingProduct && (
          <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 shadow-lg">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Edit Product</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded"
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded"
                    rows="3"
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border rounded"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({...editingProduct, price: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                 <button
                   onClick={() => updateProduct(editingProduct.id, editingProduct)}
                   className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded"
                 >
                   Update Product
                 </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchAdmin;
