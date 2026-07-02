"""
Comprehensive backend test for Revolut Business Terminal payment integration.
Tests all 16 scenarios from the review request.
"""
import requests
import json
from typing import Optional, Dict, Any

# Backend URL from frontend/.env
BASE_URL = "https://0932a0fc-7c56-4208-923a-553a37bcbed5.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
WALKER_EVENT_CODE = "FEST01"
WALKER_PIN = "1234"  # Jake Miller with terminal REV71
SUPERVISOR_EMAIL = "sup@walkfellas.io"
SUPERVISOR_PASSWORD = "sup123"
ADMIN_EMAIL = "admin@walkfellas.io"
ADMIN_PASSWORD = "admin123"

# Global tokens
walker_token = None
supervisor_token = None
admin_token = None
walker_id = None
walker_terminal_code = None
product_ids = []
pending_payment_id = None
original_terminal_code = None


def print_test(test_num: int, description: str):
    """Print test header."""
    print(f"\n{'='*80}")
    print(f"TEST {test_num}: {description}")
    print('='*80)


def print_result(success: bool, message: str, response: Optional[Any] = None):
    """Print test result."""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if response is not None:
        print(f"Response: {json.dumps(response, indent=2)}")


def login_walker() -> Dict[str, Any]:
    """Test 1: Login as walker."""
    print_test(1, "Login as walker (event_code FEST01, PIN 1234 = Jake Miller)")
    
    response = requests.post(
        f"{BASE_URL}/auth/walker/login",
        json={"event_code": WALKER_EVENT_CODE, "pin": WALKER_PIN}
    )
    
    if response.status_code == 200:
        data = response.json()
        global walker_token, walker_id
        walker_token = data.get("access_token")
        walker_id = data.get("user", {}).get("id")
        print_result(True, f"Walker login successful. Walker ID: {walker_id}", data)
        return data
    else:
        print_result(False, f"Walker login failed with status {response.status_code}", response.json())
        return {}


def login_supervisor() -> Dict[str, Any]:
    """Test 1: Login as supervisor."""
    print_test(1, "Login as supervisor (sup@walkfellas.io/sup123)")
    
    response = requests.post(
        f"{BASE_URL}/auth/staff/login",
        json={"email": SUPERVISOR_EMAIL, "password": SUPERVISOR_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        global supervisor_token
        supervisor_token = data.get("access_token")
        print_result(True, "Supervisor login successful", data)
        return data
    else:
        print_result(False, f"Supervisor login failed with status {response.status_code}", response.json())
        return {}


def login_admin() -> Dict[str, Any]:
    """Test 1: Login as admin."""
    print_test(1, "Login as admin (admin@walkfellas.io/admin123)")
    
    response = requests.post(
        f"{BASE_URL}/auth/staff/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    
    if response.status_code == 200:
        data = response.json()
        global admin_token
        admin_token = data.get("access_token")
        print_result(True, "Admin login successful", data)
        return data
    else:
        print_result(False, f"Admin login failed with status {response.status_code}", response.json())
        return {}


def test_auth_me():
    """Test 2: GET /api/auth/me as walker - confirm terminal_code field."""
    print_test(2, "GET /api/auth/me as walker - confirm terminal_code field (should be REV71)")
    
    response = requests.get(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        global walker_terminal_code
        walker_terminal_code = data.get("terminal_code")
        if walker_terminal_code:
            print_result(True, f"terminal_code field present: {walker_terminal_code}", data)
        else:
            print_result(False, "terminal_code field missing or None", data)
    else:
        print_result(False, f"GET /auth/me failed with status {response.status_code}", response.json())


def test_revolut_status():
    """Test 3: GET /api/admin/revolut/status."""
    print_test(3, "GET /api/admin/revolut/status - expect configured: false, env: sandbox")
    
    response = requests.get(
        f"{BASE_URL}/admin/revolut/status",
        headers={"Authorization": f"Bearer {supervisor_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        configured = data.get("configured")
        env = data.get("env")
        if configured == False and env == "sandbox":
            print_result(True, f"Revolut status correct: configured={configured}, env={env}", data)
        else:
            print_result(False, f"Unexpected status: configured={configured}, env={env}", data)
    else:
        print_result(False, f"GET /admin/revolut/status failed with status {response.status_code}", response.json())


def test_sync_terminals():
    """Test 4: POST /api/admin/revolut/sync-terminals - expect 400 error."""
    print_test(4, "POST /api/admin/revolut/sync-terminals - expect 400 with clear message about REVOLUT_MERCHANT_SECRET_KEY")
    
    response = requests.post(
        f"{BASE_URL}/admin/revolut/sync-terminals",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    
    if response.status_code == 400:
        data = response.json()
        detail = data.get("detail", "")
        if "REVOLUT_MERCHANT_SECRET_KEY" in detail:
            print_result(True, f"Correct 400 error with message about REVOLUT_MERCHANT_SECRET_KEY", data)
        else:
            print_result(False, f"400 error but message doesn't mention REVOLUT_MERCHANT_SECRET_KEY", data)
    else:
        print_result(False, f"Expected 400 but got {response.status_code}", response.json())


def test_assign_terminal():
    """Test 5: PUT /api/walkers/{walker_id}/terminal - update and verify."""
    print_test(5, "PUT /api/walkers/{walker_id}/terminal - set to REV99, verify, then restore")
    
    global original_terminal_code
    original_terminal_code = walker_terminal_code
    
    # Update to REV99
    response = requests.put(
        f"{BASE_URL}/walkers/{walker_id}/terminal",
        headers={"Authorization": f"Bearer {supervisor_token}"},
        json={"terminal_code": "REV99"}
    )
    
    if response.status_code == 200:
        data = response.json()
        print_result(True, "Terminal code updated to REV99", data)
        
        # Verify via GET /api/walkers
        verify_response = requests.get(
            f"{BASE_URL}/walkers",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        
        if verify_response.status_code == 200:
            walkers = verify_response.json()
            walker = next((w for w in walkers if w.get("id") == walker_id), None)
            if walker and walker.get("terminal_code") == "REV99":
                print_result(True, "Verified terminal_code is REV99 via GET /walkers")
            else:
                print_result(False, f"terminal_code not REV99 in GET /walkers: {walker}")
        
        # Restore original
        restore_response = requests.put(
            f"{BASE_URL}/walkers/{walker_id}/terminal",
            headers={"Authorization": f"Bearer {supervisor_token}"},
            json={"terminal_code": original_terminal_code}
        )
        
        if restore_response.status_code == 200:
            print_result(True, f"Restored terminal_code to {original_terminal_code}")
        else:
            print_result(False, f"Failed to restore terminal_code: {restore_response.status_code}")
    else:
        print_result(False, f"PUT /walkers/{walker_id}/terminal failed with status {response.status_code}", response.json())


def ensure_open_shift():
    """Test 6: Ensure walker has an open shift with products."""
    print_test(6, "Ensure walker has open shift - assign bag if needed")
    
    # Check current shift
    response = requests.get(
        f"{BASE_URL}/shifts/current",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        shift = data.get("shift")
        
        if shift:
            print_result(True, f"Walker already has open shift: {shift.get('id')}", data)
            return
        
        # No open shift, need to assign bag
        print("No open shift found. Assigning bag as supervisor...")
        
        # Get products first
        products_response = requests.get(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        
        if products_response.status_code == 200:
            products = products_response.json()
            global product_ids
            product_ids = [p["id"] for p in products[:3]]  # Get first 3 products
            
            # Assign bag
            assign_response = requests.post(
                f"{BASE_URL}/shifts/assign-bag",
                headers={"Authorization": f"Bearer {supervisor_token}"},
                json={
                    "walker_id": walker_id,
                    "items": [{"product_id": pid, "quantity": 10} for pid in product_ids]
                }
            )
            
            if assign_response.status_code == 200:
                print_result(True, "Bag assigned successfully", assign_response.json())
            else:
                print_result(False, f"Failed to assign bag: {assign_response.status_code}", assign_response.json())
        else:
            print_result(False, f"Failed to get products: {products_response.status_code}", products_response.json())
    else:
        print_result(False, f"GET /shifts/current failed with status {response.status_code}", response.json())


def test_revolut_charge():
    """Test 7: POST /api/payments/revolut/charge - create pending payment."""
    print_test(7, "POST /api/payments/revolut/charge - expect pending payment with simulated=true")
    
    # Get products to calculate amount
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code != 200:
        print_result(False, "Failed to get products for charge", products_response.json())
        return
    
    products = products_response.json()
    if not products:
        print_result(False, "No products available", None)
        return
    
    product = products[0]
    product_id = product["id"]
    price = product["price"]
    
    response = requests.post(
        f"{BASE_URL}/payments/revolut/charge",
        headers={"Authorization": f"Bearer {walker_token}"},
        json={
            "items": [{"product_id": product_id, "quantity": 1}],
            "amount": price
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        global pending_payment_id
        pending_payment_id = data.get("id")
        status = data.get("status")
        simulated = data.get("simulated")
        terminal_code = data.get("terminal_code")
        
        if status == "awaiting_payment" and simulated == True and terminal_code == walker_terminal_code:
            print_result(True, f"Pending payment created: id={pending_payment_id}, status={status}, simulated={simulated}, terminal_code={terminal_code}", data)
        else:
            print_result(False, f"Unexpected response: status={status}, simulated={simulated}, terminal_code={terminal_code}", data)
    else:
        print_result(False, f"POST /payments/revolut/charge failed with status {response.status_code}", response.json())


def test_payment_status_before_simulate():
    """Test 8: GET /api/payments/revolut/{pending_id}/status - before simulate."""
    print_test(8, "GET /api/payments/revolut/{pending_id}/status - expect status awaiting_payment")
    
    response = requests.get(
        f"{BASE_URL}/payments/revolut/{pending_payment_id}/status",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        status = data.get("status")
        if status == "awaiting_payment":
            print_result(True, f"Status is awaiting_payment", data)
        else:
            print_result(False, f"Unexpected status: {status}", data)
    else:
        print_result(False, f"GET /payments/revolut/{pending_payment_id}/status failed with status {response.status_code}", response.json())


def test_simulate_payment():
    """Test 9: POST /api/payments/revolut/{pending_id}/simulate."""
    print_test(9, "POST /api/payments/revolut/{pending_id}/simulate - expect sale created")
    
    response = requests.post(
        f"{BASE_URL}/payments/revolut/{pending_payment_id}/simulate",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        ok = data.get("ok")
        sale = data.get("sale")
        
        if ok and sale:
            payment_method = sale.get("payment_method")
            terminal_code = sale.get("terminal_code")
            total = sale.get("total")
            
            if payment_method == "revolut_terminal" and terminal_code == walker_terminal_code:
                print_result(True, f"Sale created: payment_method={payment_method}, terminal_code={terminal_code}, total={total}", data)
            else:
                print_result(False, f"Unexpected sale data: payment_method={payment_method}, terminal_code={terminal_code}", data)
        else:
            print_result(False, "Missing ok or sale in response", data)
    else:
        print_result(False, f"POST /payments/revolut/{pending_payment_id}/simulate failed with status {response.status_code}", response.json())


def test_payment_status_after_simulate():
    """Test 10: GET /api/payments/revolut/{pending_id}/status - after simulate."""
    print_test(10, "GET /api/payments/revolut/{pending_id}/status - expect status paid with sale_id")
    
    response = requests.get(
        f"{BASE_URL}/payments/revolut/{pending_payment_id}/status",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        status = data.get("status")
        sale_id = data.get("sale_id")
        
        if status == "paid" and sale_id:
            print_result(True, f"Status is paid with sale_id: {sale_id}", data)
        else:
            print_result(False, f"Unexpected: status={status}, sale_id={sale_id}", data)
    else:
        print_result(False, f"GET /payments/revolut/{pending_payment_id}/status failed with status {response.status_code}", response.json())


def test_simulate_idempotency():
    """Test 11: POST /api/payments/revolut/{pending_id}/simulate AGAIN - verify idempotency."""
    print_test(11, "POST /api/payments/revolut/{pending_id}/simulate AGAIN - verify idempotent (no double deduction)")
    
    # Get current stock before second simulate
    stock_before_response = requests.get(
        f"{BASE_URL}/shifts/current",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if stock_before_response.status_code != 200:
        print_result(False, "Failed to get stock before second simulate", stock_before_response.json())
        return
    
    stock_before = stock_before_response.json().get("stock", {})
    
    # Call simulate again
    response = requests.post(
        f"{BASE_URL}/payments/revolut/{pending_payment_id}/simulate",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        
        # Get stock after second simulate
        stock_after_response = requests.get(
            f"{BASE_URL}/shifts/current",
            headers={"Authorization": f"Bearer {walker_token}"}
        )
        
        if stock_after_response.status_code == 200:
            stock_after = stock_after_response.json().get("stock", {})
            
            # Stock should be the same (no double deduction)
            if stock_before == stock_after:
                print_result(True, f"Idempotent: stock unchanged after second simulate. Stock: {stock_after}", data)
            else:
                print_result(False, f"NOT idempotent: stock changed! Before: {stock_before}, After: {stock_after}", data)
        else:
            print_result(False, "Failed to get stock after second simulate", stock_after_response.json())
    else:
        print_result(False, f"Second simulate failed with status {response.status_code}", response.json())


def test_insufficient_stock():
    """Test 12: Test charging with insufficient stock."""
    print_test(12, "POST /api/payments/revolut/charge with huge quantity - expect 400 Insufficient stock")
    
    # Get products
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code != 200:
        print_result(False, "Failed to get products", products_response.json())
        return
    
    products = products_response.json()
    if not products:
        print_result(False, "No products available", None)
        return
    
    product = products[0]
    product_id = product["id"]
    
    response = requests.post(
        f"{BASE_URL}/payments/revolut/charge",
        headers={"Authorization": f"Bearer {walker_token}"},
        json={
            "items": [{"product_id": product_id, "quantity": 9999}],
            "amount": 99999.99
        }
    )
    
    if response.status_code == 400:
        data = response.json()
        detail = data.get("detail", "")
        if "Insufficient stock" in detail or "insufficient stock" in detail.lower():
            print_result(True, f"Correct 400 error: {detail}", data)
        else:
            print_result(False, f"400 error but wrong message: {detail}", data)
    else:
        print_result(False, f"Expected 400 but got {response.status_code}", response.json())


def test_no_terminal_assigned():
    """Test 13: Test charging with no terminal assigned."""
    print_test(13, "Test charging with no terminal assigned - expect 400 error")
    
    # Temporarily unset terminal
    unset_response = requests.put(
        f"{BASE_URL}/walkers/{walker_id}/terminal",
        headers={"Authorization": f"Bearer {supervisor_token}"},
        json={"terminal_code": ""}
    )
    
    # Try to charge
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code == 200:
        products = products_response.json()
        if products:
            product = products[0]
            
            response = requests.post(
                f"{BASE_URL}/payments/revolut/charge",
                headers={"Authorization": f"Bearer {walker_token}"},
                json={
                    "items": [{"product_id": product["id"], "quantity": 1}],
                    "amount": product["price"]
                }
            )
            
            if response.status_code == 400:
                data = response.json()
                detail = data.get("detail", "")
                if "terminal" in detail.lower():
                    print_result(True, f"Correct 400 error about terminal: {detail}", data)
                else:
                    print_result(False, f"400 error but wrong message: {detail}", data)
            else:
                print_result(False, f"Expected 400 but got {response.status_code}", response.json())
    
    # Restore terminal
    restore_response = requests.put(
        f"{BASE_URL}/walkers/{walker_id}/terminal",
        headers={"Authorization": f"Bearer {supervisor_token}"},
        json={"terminal_code": walker_terminal_code}
    )
    
    if restore_response.status_code == 200:
        print("Terminal code restored")


def test_cancel_payment():
    """Test 14: POST /api/payments/revolut/{pending_id}/cancel."""
    print_test(14, "POST /api/payments/revolut/{pending_id}/cancel - verify status becomes cancelled")
    
    # Create a new pending payment first
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code != 200:
        print_result(False, "Failed to get products", products_response.json())
        return
    
    products = products_response.json()
    if not products:
        print_result(False, "No products available", None)
        return
    
    product = products[0]
    
    charge_response = requests.post(
        f"{BASE_URL}/payments/revolut/charge",
        headers={"Authorization": f"Bearer {walker_token}"},
        json={
            "items": [{"product_id": product["id"], "quantity": 1}],
            "amount": product["price"]
        }
    )
    
    if charge_response.status_code != 200:
        print_result(False, "Failed to create charge for cancel test", charge_response.json())
        return
    
    cancel_pending_id = charge_response.json().get("id")
    
    # Cancel it
    cancel_response = requests.post(
        f"{BASE_URL}/payments/revolut/{cancel_pending_id}/cancel",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if cancel_response.status_code == 200:
        # Verify status
        status_response = requests.get(
            f"{BASE_URL}/payments/revolut/{cancel_pending_id}/status",
            headers={"Authorization": f"Bearer {walker_token}"}
        )
        
        if status_response.status_code == 200:
            data = status_response.json()
            status = data.get("status")
            if status == "cancelled":
                print_result(True, f"Payment cancelled successfully, status: {status}", data)
            else:
                print_result(False, f"Status not cancelled: {status}", data)
        else:
            print_result(False, "Failed to get status after cancel", status_response.json())
    else:
        print_result(False, f"Cancel failed with status {cancel_response.status_code}", cancel_response.json())


def test_webhook_invalid_signature():
    """Test 15: POST /api/payments/revolut/webhook with invalid signature."""
    print_test(15, "POST /api/payments/revolut/webhook with invalid signature - expect 401")
    
    response = requests.post(
        f"{BASE_URL}/payments/revolut/webhook",
        headers={"Revolut-Signature": "invalid_signature"},
        json={"order": {"id": "test", "state": "completed"}}
    )
    
    if response.status_code == 401:
        data = response.json()
        detail = data.get("detail", "")
        if "signature" in detail.lower():
            print_result(True, f"Correct 401 error: {detail}", data)
        else:
            print_result(False, f"401 error but wrong message: {detail}", data)
    else:
        print_result(False, f"Expected 401 but got {response.status_code}", response.json())


def test_old_terminal_flow():
    """Test 16: Verify old terminal flow still works."""
    print_test(16, "POST /api/payments/simulate-terminal - verify old flow still works")
    
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code != 200:
        print_result(False, "Failed to get products", products_response.json())
        return
    
    products = products_response.json()
    if not products:
        print_result(False, "No products available", None)
        return
    
    product = products[0]
    
    response = requests.post(
        f"{BASE_URL}/payments/simulate-terminal",
        headers={"Authorization": f"Bearer {walker_token}"},
        json={
            "items": [{"product_id": product["id"], "quantity": 1}],
            "amount": product["price"]
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        sale = data.get("sale")
        if sale:
            print_result(True, "Old terminal flow works", data)
        else:
            print_result(False, "No sale in response", data)
    else:
        print_result(False, f"Old terminal flow failed with status {response.status_code}", response.json())


def test_manual_cash_sale():
    """Test 16: Verify manual cash sale still works."""
    print_test(16, "POST /api/sales - verify manual cash sale still works")
    
    products_response = requests.get(
        f"{BASE_URL}/products",
        headers={"Authorization": f"Bearer {walker_token}"}
    )
    
    if products_response.status_code != 200:
        print_result(False, "Failed to get products", products_response.json())
        return
    
    products = products_response.json()
    if not products:
        print_result(False, "No products available", None)
        return
    
    product = products[0]
    
    response = requests.post(
        f"{BASE_URL}/sales",
        headers={"Authorization": f"Bearer {walker_token}"},
        json={
            "items": [{"product_id": product["id"], "quantity": 1}],
            "payment_method": "cash"
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("id"):
            print_result(True, "Manual cash sale works", data)
        else:
            print_result(False, "No sale id in response", data)
    else:
        print_result(False, f"Manual cash sale failed with status {response.status_code}", response.json())


def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("REVOLUT BUSINESS TERMINAL PAYMENT INTEGRATION - BACKEND TEST")
    print("="*80)
    
    try:
        # Test 1: Auth setup
        login_walker()
        login_supervisor()
        login_admin()
        
        if not walker_token or not supervisor_token or not admin_token:
            print("\n❌ CRITICAL: Failed to authenticate. Cannot proceed with tests.")
            return
        
        # Test 2: GET /api/auth/me
        test_auth_me()
        
        # Test 3: GET /api/admin/revolut/status
        test_revolut_status()
        
        # Test 4: POST /api/admin/revolut/sync-terminals
        test_sync_terminals()
        
        # Test 5: PUT /api/walkers/{walker_id}/terminal
        test_assign_terminal()
        
        # Test 6: Ensure open shift
        ensure_open_shift()
        
        # Test 7: POST /api/payments/revolut/charge
        test_revolut_charge()
        
        if not pending_payment_id:
            print("\n❌ CRITICAL: Failed to create pending payment. Cannot proceed with payment tests.")
            return
        
        # Test 8: GET /api/payments/revolut/{pending_id}/status (before simulate)
        test_payment_status_before_simulate()
        
        # Test 9: POST /api/payments/revolut/{pending_id}/simulate
        test_simulate_payment()
        
        # Test 10: GET /api/payments/revolut/{pending_id}/status (after simulate)
        test_payment_status_after_simulate()
        
        # Test 11: Simulate idempotency
        test_simulate_idempotency()
        
        # Test 12: Insufficient stock
        test_insufficient_stock()
        
        # Test 13: No terminal assigned
        test_no_terminal_assigned()
        
        # Test 14: Cancel payment
        test_cancel_payment()
        
        # Test 15: Webhook invalid signature
        test_webhook_invalid_signature()
        
        # Test 16: Old flows still work
        test_old_terminal_flow()
        test_manual_cash_sale()
        
        print("\n" + "="*80)
        print("ALL TESTS COMPLETED")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
