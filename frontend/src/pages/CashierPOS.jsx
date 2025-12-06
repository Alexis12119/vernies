import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { productAPI, salesAPI } from '../services/api';

const CashierPOS = () => {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [todaySales, setTodaySales] = useState([]);
  const [totalSales, setTotalSales] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [change, setChange] = useState(0);

  useEffect(() => {
    fetchProducts();
    fetchTodaySales();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await productAPI.getProducts();
      setProducts(response.data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTodaySales = async () => {
    try {
      const response = await salesAPI.getSales();
      const today = new Date().toDateString();
      const todayData = response.data.filter(sale => 
        new Date(sale.created_at).toDateString() === today
      );
      setTodaySales(todayData);
      setTotalSales(todayData.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0));
    } catch (error) {
      console.error('Failed to fetch sales:', error);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    product.stock > 0
  );

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.product_id === product.id);
    
    if (existingItem) {
      if (existingItem.qty < product.stock) {
        setCart(cart.map(item =>
          item.product_id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item
        ));
      }
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
        stock: product.stock
      }]);
    }
  };

  const updateQuantity = (productId, newQty) => {
    if (newQty <= 0) {
      setCart(cart.filter(item => item.product_id !== productId));
    } else {
      const item = cart.find(item => item.product_id === productId);
      if (newQty <= item.stock) {
        setCart(cart.map(item =>
          item.product_id === productId
            ? { ...item, qty: newQty }
            : item
        ));
      }
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const checkout = () => {
    if (cart.length === 0) return;
    setShowPaymentInput(true);
    setPaymentAmount('');
    setChange(0);
  };

  const processPayment = async () => {
    const total = getTotal();
    const payment = parseFloat(paymentAmount);
    
    if (isNaN(payment) || payment <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    
    if (payment < total) {
      alert('Payment amount is insufficient');
      return;
    }
    
    setChange(payment - total);

    try {
      await salesAPI.createSale({
        items: cart.map(item => ({
          product_id: item.product_id,
          qty: item.qty,
          price: item.price
        }))
      });

      setCart([]);
      fetchProducts();
      fetchTodaySales();
      setShowPaymentInput(false);
      setPaymentAmount('');
      setChange(0);
      alert('Sale completed successfully!');
    } catch (error) {
      alert('Sale failed: ' + (error.response?.data?.error || error.message));
    }
  };

  const cancelPayment = () => {
    setShowPaymentInput(false);
    setPaymentAmount('');
    setChange(0);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cashier POS</h1>
              <p className="text-sm text-gray-500">Branch: {user.branch_id || 'Not assigned'}</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Today's Sales</p>
                <p className="text-lg font-semibold">₱ {totalSales.toFixed(2)}</p>
              </div>
              <button
                onClick={logout}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Products</h2>
              <input
                type="text"
                placeholder="Search products..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {filteredProducts.map(product => (
                  <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-medium">{product.name}</h3>
                    <p className="text-gray-500">₱ {product.price}</p>
                    <p className="text-sm text-gray-400">Stock: {product.stock}</p>
                    <button
                      onClick={() => addToCart(product)}
                      className="mt-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded text-sm"
                      disabled={product.stock === 0}
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Cart</h2>
              {cart.length === 0 ? (
                <p className="text-gray-500">Cart is empty</p>
              ) : (
                <div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.product_id} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-500">${item.price}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.product_id, item.qty - 1)}
                            className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                          >
                            -
                          </button>
                          <span>{item.qty}</span>
                          <button
                            onClick={() => updateQuantity(item.product_id, item.qty + 1)}
                            className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product_id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                   <div className="mt-4 pt-4 border-t">
                     <div className="flex justify-between items-center mb-4">
                       <span className="font-semibold">Total:</span>
                       <span className="font-bold text-lg">₱ {getTotal().toFixed(2)}</span>
                     </div>
                     
                     {showPaymentInput && (
                       <div className="space-y-3 mb-4">
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">
                             Payment Amount
                           </label>
                           <input
                             type="number"
                             step="0.01"
                             className="w-full px-3 py-2 border rounded"
                             value={paymentAmount}
                             onChange={(e) => setPaymentAmount(e.target.value)}
                             placeholder="Enter amount received"
                             autoFocus
                           />
                         </div>
                         {change > 0 && (
                           <div className="bg-green-50 p-3 rounded">
                             <p className="text-green-800 font-medium">
                               Change: ₱ {change.toFixed(2)}
                             </p>
                           </div>
                         )}
                         <div className="flex space-x-2">
                           <button
                             onClick={processPayment}
                             className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded"
                           >
                             Complete Sale
                           </button>
                           <button
                             onClick={cancelPayment}
                             className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 rounded"
                           >
                             Cancel
                           </button>
                         </div>
                       </div>
                     )}
                     
                     {!showPaymentInput && (
                       <button
                         onClick={checkout}
                         className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded"
                       >
                         Checkout
                       </button>
                     )}
                   </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-lg font-semibold mb-4">Today's Transactions</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todaySales.map(sale => (
                  <div key={sale.id} className="text-sm">
                    <div className="flex justify-between">
                      <span>Sale #{sale.id}</span>
                      <span>₱ {parseFloat(sale.total_amount).toFixed(2)}</span>
                    </div>
                    <p className="text-gray-400 text-xs">
                      {new Date(sale.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CashierPOS;
