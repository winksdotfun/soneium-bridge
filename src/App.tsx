import { useState, useEffect } from 'react'
import './App.css'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import abi from './abi.json'
import { ethers } from 'ethers'

function App() {
  const [amount, setAmount] = useState('0')
  const [balance, setBalance] = useState('0')
  const [soneumBalance, setSoneumBalance] = useState('0')
  const [error, setError] = useState('')
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const contractAddress = '0x4036a6Ff8C1a29677108Aef299B560f6E4fA5e71'

  useEffect(() => {
    const checkBalance = async () => {
      try {
        if (window.ethereum) {
          const provider = new ethers.providers.Web3Provider(window.ethereum)
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
          const userAccount = accounts[0]
          
          const balance = await provider.getBalance(userAccount)
          console.log('User balance:', ethers.utils.formatEther(balance), 'ASTR')
          setBalance(ethers.utils.formatEther(balance))
        }
      } catch (error) {
        console.error('Error checking balance:', error)
      }
    }
    const checkSoneumBalance = async () => {
      try {
        if (window.ethereum) {
          // Connect to Soneum network
          const soneumProvider = new ethers.providers.JsonRpcProvider('https://rpc.soneium.org')
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
          const userAccount = accounts[0]
          
          const soneumBalance = await soneumProvider.getBalance(userAccount)
          console.log('User Soneum balance:', ethers.utils.formatEther(soneumBalance), 'SON')
          setSoneumBalance(ethers.utils.formatEther(soneumBalance))
        }
      } catch (error) {
        console.error('Error checking Soneum balance:', error)
      }
    }

    checkBalance()
    checkSoneumBalance()
  }, []) // Empty dependency array means this runs once on component mount

  const validateTransaction = () => {
    if (!window.ethereum) {
      setError('Please connect your wallet first')
      setShowErrorModal(true)
      return false
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount')
      setShowErrorModal(true)
      return false
    }

    if (parseFloat(amount) > parseFloat(balance)) {
      setError('Insufficient balance')
      setShowErrorModal(true)
      return false
    }

    setError('')
    return true
  }

  const BridgeHandler = async () => {
    if (!validateTransaction()) {
      return
    }

    setIsLoading(true) // Start loading
    try {
      // Check if amount is valid
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert('Please enter a valid amount')
        return
      }
      
      // Check if window.ethereum is available
      if (!window.ethereum) {
        alert('Please install MetaMask or another web3 provider')
        return
      }
      
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const userAccount = accounts[0]
      
      // Convert amount to wei (10^18)
      const amountInWei = ethers.utils.parseEther(amount).toString()
      
      // Create provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      
      // Create contract instance
      const contract = new ethers.Contract(contractAddress, abi, signer)
      
      // CCIP message parameters
      const destinationChainSelector = "12505351618335765396" // Soneium chain selector
      
      console.log(userAccount)
      // Properly encode the receiver address as bytes
      const encodedReceiver = ethers.utils.defaultAbiCoder.encode(['address'], [userAccount])
      
      // Format message according to the EtherSenderReceiver contract requirements
      const message = {
        receiver: encodedReceiver, // Now properly encoded as bytes
        data: "0x", // Will be overwritten by contract with msg.sender
        tokenAmounts: [{
          token: ethers.constants.AddressZero, // Will be overwritten by contract with WETH address
          amount: amountInWei
        }],
        feeToken: ethers.constants.AddressZero, // Using native token for fees
        extraArgs: "0x" // No extra args needed
      }
      
      console.log('Sending transaction with params:', {
        destinationChainSelector,
        message
      })

      // Get the fee estimate
      const fee = await contract.getFee(destinationChainSelector, message)

      
      console.log('Estimated fee:', ethers.utils.formatEther(fee), 'ASTR')

      // Total value to send = amount + fee
      const totalValue = ethers.BigNumber.from(amountInWei).add(fee)
      
      // Send transaction with the total value as msg.value
      const tx = await contract.ccipSend(
        destinationChainSelector,
        message,
        { 
          value: totalValue,
          gasLimit: 500000 // Set appropriate gas limit
        }
      )
      
      console.log('Transaction sent:', tx.hash)
      setTxHash(tx.hash)  // Save tx hash
      
      // Wait for transaction to be mined
      const receipt = await tx.wait()
      console.log('Transaction confirmed:', receipt)
      
      setShowSuccessModal(true)  // Show success modal instead of alert
    } catch (error: any) {
      console.error('Bridge transaction failed:', error)
      
      // Better error handling
      let errorMessage = error.message || 'Unknown error occurred'
      
      // Check for specific error signatures
      if (errorMessage.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds to complete the transaction'
      } else if (errorMessage.includes('user rejected')) {
        errorMessage = 'Transaction was rejected by user'
      } else if (errorMessage.includes('CALL_EXCEPTION')) {
        errorMessage = 'Transaction reverted. Please check your input values and try again.'
      }
      
      alert(`Transaction failed: ${errorMessage}`)
      setError(errorMessage)
      setShowErrorModal(true)
    } finally {
      setIsLoading(false) // Stop loading regardless of outcome
    }
  }

  const ErrorModal = () => {
    if (!showErrorModal) return null

    return (
      <div className="modal-overlay" onClick={() => setShowErrorModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2"/>
              <line x1="12" y1="16" x2="12" y2="16" strokeWidth="2"/>
            </svg>
            Error
          </div>
          <div className="modal-message">{error}</div>
          <button 
            className="modal-button"
            onClick={() => setShowErrorModal(false)}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const SuccessModal = () => {
    if (!showSuccessModal) return null

    return (
      <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
        <div className="modal-content success" onClick={e => e.stopPropagation()}>
          <div className="modal-header success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="22 4 12 14.01 9 11.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Success
          </div>
          <div className="modal-message">
            Transaction successful!
            <a 
              href={`https://astar.subscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-hash"
            >
              View transaction
            </a>
          </div>
          <button 
            className="modal-button success"
            onClick={() => setShowSuccessModal(false)}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const LoadingModal = () => {
    if (!isLoading) return null

    return (
      <div className="modal-overlay">
        <div className="modal-content loading">
          <div className="modal-header loading">
            <div className="spinner"></div>
            Processing
          </div>
          <div className="modal-message">
            Please wait while your transaction is being processed...
            {txHash && (
              <a 
                href={`https://astar.subscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-hash"
              >
                View transaction
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="container">
        <div className="bridge-card">
          <div className='connect-button'>
            <ConnectButton />
          </div>
          {/* From section */}
          <div className="transfer-section">
            <div className="section-header">
              <div>From</div>

              <div className="balance">Balance: {Number(balance).toFixed(2)} ASTR</div>

            </div>
            <div className="network-row">
              <div className="network-info">
                <img src="https://portal.astar.network/img/astar.4c1375f6.png" className="network-logo" alt="Astar EVM" />
                <span className="network-name">Astar EVM</span>
              </div>
            </div>
          </div>

          {/* Switch button */}
          {/* <div className="switch-button">
            <button className="switch-networks">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" 
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div> */}

          {/* To section */}
          <div className="transfer-section">
            <div className="section-header">
            <div>To</div>
            <div className="balance">Balance: {Number(soneumBalance).toFixed(4)} ASTR</div>

            </div>
            <div className="network-row">
              <div className="network-info">
                <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8xNzEzXzE5NTYpIj4KPGNpcmNsZSBjeD0iMTI4IiBjeT0iMTI4IiByPSIxMjgiIGZpbGw9IndoaXRlIi8+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMV8xNzEzXzE5NTYpIj4KPHBhdGggZD0iTTE0MS41ODUgMTg0LjY3NkMxMzEuODE3IDE4Ny4wMTQgMTIxLjYxMSAxODYuODE4IDExMS45NDEgMTg0LjEwNkMxMDIuMjcgMTgxLjM5NCA5My40NTkxIDE3Ni4yNTcgODYuMzQ2MiAxNjkuMTg0Qzc2LjkyOTMgMTYwLjIxOSA3MC44NzYgMTQ4LjMwOSA2OS4xOTM4IDEzNS40MzZDNjcuNTExNyAxMjIuNTYzIDcwLjMwMjIgMTA5LjUwNSA3Ny4xMDA5IDk4LjQzMzlDODEuNTY1OCA5MS4yMTY4IDg2Ljk0NDkgODQuNjAzOCA5My4xMDU0IDc4Ljc1ODFDMTEyLjY1OCA1OS4zNDA3IDE0OC41NTEgMjQuMDE3NSAxNDguNTUxIDI0LjAxNzVDMTIxLjg2OCAxOC43NDIzIDk0LjE3MTYgMjMuOTAyOSA3MS4yMDAxIDM4LjQzMDFDNDguMjI4MiA1Mi45NTc0IDMxLjc0MTEgNzUuNzM4MiAyNS4xNTM2IDEwMi4wNTRDMTguNTY2MSAxMjguMzY5IDIyLjM4MzIgMTU2LjIwMyAzNS44MTQyIDE3OS43ODlDNDkuMjQ1MiAyMDMuMzc1IDcxLjI2MDggMjIwLjkwNyA5Ny4zMDEgMjI4Ljc1MkwxNDEuNTg1IDE4NC42NzZaIiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNMTE0LjMxNiA3MC41MjE1QzEyNC4wODMgNjguMTgwNSAxMzQuMjkgNjguMzc1NSAxNDMuOTYgNzEuMDg3OEMxNTMuNjMxIDczLjggMTYyLjQ0MyA3OC45MzkxIDE2OS41NTQgODYuMDE0MkMxODguOTI1IDEwNS4zMjggMTkyLjcwNiAxMzMuOTkgMTc4LjcyMSAxNTYuNjYxQzE3NC4yNDkgMTYzLjg3OSAxNjguODcxIDE3MC41MDEgMTYyLjcxNyAxNzYuMzYyQzE0My4xNjUgMTk1Ljc1MyAxMDcuMjcxIDIzMS4xMDIgMTA3LjI3MSAyMzEuMTAyQzEzMy45NzkgMjM2LjQyOSAxNjEuNzE5IDIzMS4yOTcgMTg0LjczIDIxNi43N0MyMDcuNzQyIDIwMi4yNDEgMjI0LjI1OSAxNzkuNDM2IDIzMC44NSAxNTMuMDg3QzIzNy40NDMgMTI2LjczNyAyMzMuNjAzIDk4Ljg2ODMgMjIwLjEzIDc1LjI2NzJDMjA2LjY1NyA1MS42NjU4IDE4NC41ODQgMzQuMTQ0OCAxNTguNDk2IDI2LjM0MThMMTE0LjMxNiA3MC41MjE1WiIgZmlsbD0iYmxhY2siLz4KPC9nPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzE3MTNfMTk1NiI+CjxyZWN0IHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8Y2xpcFBhdGggaWQ9ImNsaXAxXzE3MTNfMTk1NiI+CjxyZWN0IHdpZHRoPSIyMTIiIGhlaWdodD0iMjEyIiBmaWxsPSJ3aGl0ZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjIgMjIpIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==" className="network-logo" alt="Soneium" />
                <span className="network-name">Soneium</span>
              </div>
            </div>
          </div>

          {/* Amount section */}
          <div className="transfer-section">

          <div className="section-header1">
            {/* <div>To</div> */}
            <div className="balance">Balance: {Number(balance).toFixed(2)} ASTR</div>

            </div>
            <div className="network-row">
              <div className="network-info">
                <img src="https://portal.astar.network/img/astar.4c1375f6.png" className="network-logo" alt="ASTR" />
                <span className="network-name">ASTR</span>
              </div>

              {/* <div className="balance">Balance: 15.016 ASTR</div> */}

              <div className="amount-input">
                <input 
                  type="text" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="token-amount"
                />
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="info-box">
            <ul>
              <li>Bridge fee: 7.68 ASTR</li>
              <li>You will receive 0.00008 ETH for gas on Soneium</li>
              <li>It could take approximately 3 mins to finalize the bridge transaction</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="action-buttons">
            <button 
              className={`action-button bridge`}
              onClick={() => validateTransaction()}
            >
              Approve
            </button>
            <button 
              className={`action-button approve ${parseFloat(amount) > 0 ? 'active' : ''}`}
              onClick={BridgeHandler}
            >
              Bridge
            </button>
          </div>
        </div>
      </div>
      <ErrorModal />
      <LoadingModal />
      <SuccessModal />
    </>
  )
}

export default App
