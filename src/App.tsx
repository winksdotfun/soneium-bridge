import { useState, useEffect } from "react";
import "./App.css";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import abi from "./abi.json";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import Confetti from 'react-confetti';


function App() {
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState("");
  const [soneumBalance, setSoneumBalance] = useState("");
  const [error, setError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pointsUpdate, setPointsUpdate]=useState(false);

  const [winkpoints, setWinkpoints] = useState(0);
  const contractAddress = "0x4036a6Ff8C1a29677108Aef299B560f6E4fA5e71";

  const { isConnected } = useAccount();

  useEffect(() => {
    const checkBalance = async () => {
      try {
        if (window.ethereum) {
          // Check if connected to the right network
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          console.log("Connected to chain ID:", chainId);
          
          // Astar Network chainId is 0x250 (592 in decimal)
          if (chainId !== '0x250') {
            console.log("Not connected to Astar Network. Please switch networks in your wallet.");
            
            // Optionally, you can prompt the user to switch networks
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x250' }], // Astar Network
              });
            } catch (error) {
              console.error("Failed to switch networks:", error);
              return;
            }
          }
          
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          
          if (accounts.length === 0) {
            console.log("No accounts found. Please connect your wallet.");
            return;
          }
          
          const userAccount = accounts[0];
          console.log("Checking balance for account:", userAccount);
    
          // Get balance with proper error handling
          const balance = await provider.getBalance(userAccount);
          console.log(
            "User balance (raw) ASTR:", balance.toString(),
            "User balance (formatted) ASTR:", ethers.utils.formatEther(balance),
            "ASTR"
          );
          setBalance(ethers.utils.formatEther(balance));
    
          // Continue with winkpoints fetch
          try {
            const winkpointsData = await fetch(
              `https://inner-circle-seven.vercel.app/api/action/getPoints?address=${userAccount}`,
              {
                method: "GET",
              }
            );
    
            const data = await winkpointsData.json();
            console.log("Winkpoints data:", data);
            setWinkpoints(data.points);
          } catch (error) {
            console.log("Error fetching winkpoints:", error);
          }
        } else {
          console.log("Ethereum provider not found. Please install MetaMask or another wallet.");
        }
      } catch (error) {
        console.error("Error checking balance:", error);
      }
    };
    
    const checkSoneumBalance = async () => {
      try {
        if (window.ethereum) {
          // Connect to Soneum network
          const soneumProvider = new ethers.providers.JsonRpcProvider(
            "https://rpc.soneium.org"
          );
          const accounts = await window.ethereum.request({
            method: "eth_requestAccounts",
          });
          const userAccount = accounts[0];

          const soneumBalance = await soneumProvider.getBalance(userAccount);
          console.log(
            "User Soneum balance:",
            ethers.utils.formatEther(soneumBalance),
            "SON"
          );
          setSoneumBalance(ethers.utils.formatEther(soneumBalance));
        }
      } catch (error) {
        console.error("Error checking Soneum balance:", error);
      }
    };

    checkBalance();
    checkSoneumBalance();
    setPointsUpdate(false);
  }, [isConnected, pointsUpdate]); 


  const validateTransaction = () => {
    if (!window.ethereum) {
      setError("Please connect your wallet first");
      setShowErrorModal(true);
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      setShowErrorModal(true);
      return false;
    }

    if (parseFloat(amount) > parseFloat(balance)) {
      setError("Insufficient balance");
      setShowErrorModal(true);
      return false;
    }

    setError("");
    return true;
  };

  const BridgeHandler = async () => {
    if (!validateTransaction()) {
      return;
    }

    setIsLoading(true); // Start loading
    try {
      // Check if amount is valid
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      // Check if window.ethereum is available
      if (!window.ethereum) {
        alert("Please install MetaMask or another web3 provider");
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const userAccount = accounts[0];

      // Convert amount to wei (10^18)
      const amountInWei = ethers.utils.parseEther(amount).toString();

      // Create provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      // Create contract instance
      const contract = new ethers.Contract(contractAddress, abi, signer);

      // CCIP message parameters
      const destinationChainSelector = "12505351618335765396"; // Soneium chain selector

      console.log(userAccount);
      // Properly encode the receiver address as bytes
      const encodedReceiver = ethers.utils.defaultAbiCoder.encode(
        ["address"],
        [userAccount]
      );

      // Format message according to the EtherSenderReceiver contract requirements
      const message = {
        receiver: encodedReceiver, // Now properly encoded as bytes
        data: "0x", // Will be overwritten by contract with msg.sender
        tokenAmounts: [
          {
            token: ethers.constants.AddressZero, // Will be overwritten by contract with WETH address
            amount: amountInWei,
          },
        ],
        feeToken: ethers.constants.AddressZero, // Using native token for fees
        extraArgs: "0x", // No extra args needed
      };

      console.log("Sending transaction with params:", {
        destinationChainSelector,
        message,
      });

      // Get the fee estimate
      const fee = await contract.getFee(destinationChainSelector, message);

      console.log("Estimated fee:", ethers.utils.formatEther(fee), "ASTR");

      // Total value to send = amount + fee
      const totalValue = ethers.BigNumber.from(amountInWei).add(fee);

      // Send transaction with the total value as msg.value
      const tx = await contract.ccipSend(destinationChainSelector, message, {
        value: totalValue,
        gasLimit: 500000, // Set appropriate gas limit
      });

      console.log("Transaction sent:", tx.hash);
      setTxHash(tx.hash); // Save tx hash

      // Wait for transaction to be mined
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);

      try {
        const response = await fetch(
          "https://inner-circle-seven.vercel.app/api/action/setPoints",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: userAccount,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to update points");
        }

        const data = await response.json();
        console.log("Points updated:", data);
        setPointsUpdate(true);
      } catch (error) {}

      setShowSuccessModal(true); // Show success modal instead of alert
    } catch (error: any) {
      console.error("Bridge transaction failed:", error);

      // Better error handling
      let errorMessage = error.message || "Unknown error occurred";

      // Check for specific error signatures
      if (errorMessage.includes("insufficient funds")) {
        errorMessage = "Insufficient funds to complete the transaction";
      } else if (errorMessage.includes("user rejected")) {
        errorMessage = "Transaction was rejected by user";
      } else if (errorMessage.includes("CALL_EXCEPTION")) {
        errorMessage =
          "Transaction reverted. Please check your input values and try again.";
      }

      alert(`Transaction failed: ${errorMessage}`);
      setError(errorMessage);
      setShowErrorModal(true);
    } finally {
      setIsLoading(false); // Stop loading regardless of outcome
    }
  };

  const ErrorModal = () => {
    if (!showErrorModal) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowErrorModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
              <line x1="12" y1="16" x2="12" y2="16" strokeWidth="2" />
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
    );
  };


  
  const SuccessModal = () => {
    const [windowDimension, setWindowDimension] = useState({ width: window.innerWidth, height: window.innerHeight });
    const points = 100;
    
    useEffect(() => {
      const handleResize = () => {
        setWindowDimension({ width: window.innerWidth, height: window.innerHeight });
      };
  
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, []);
  
    if (!showSuccessModal) return null;
  
    return (
      <div className="fixed inset-0 flex items-center justify-center backdrop-blur-lg z-50" onClick={() => setShowSuccessModal(false)}>
        {/* Confetti overlay */}
        <Confetti
          width={windowDimension.width}
          height={windowDimension.height}
          recycle={false}
          numberOfPieces={150}
          colors={['#9333EA', '#A855F7', '#C084FC', '#4F46E5', '#6366F1', '#38BDF8']}
        />
        
        <div 
          className=" rounded-xl shadow-xl max-w-md w-11/12 overflow-hidden border border-[#3b82f6]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center justify-center pt-6 pb-2">
            <div className="bg-[#3b82f6] p-3 rounded-full mb-4 shadow-lg shadow-purple-500/20">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">
              Woo-hoo!🎉 <br /> Transaction Successful
            </h2>
          </div>
          
          <div className="px-6 py-4 text-center">
            <p className="text-lg text-white mb-3">
              You just scored <span className="font-bold text-[#3b82f6] text-xl">{points} Wink Points</span>!
            </p>
            
            <div className=" flex justify-center items-center gap-4">
            <a
              href={`https://astar.subscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-purple-900/50 transition-colors duration-200"
            >
              View transaction
            </a>
          
            <h6
              className="w-[40%] bg-[#3b82f6]  text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#3b82f6]/70 transition-all duration-200 transform hover:-translate-y-1 shadow-md hover:shadow-lg shadow-purple-500/20"
              onClick={() => setShowSuccessModal(false)}
            >
              Close
            </h6>
          </div>

          </div>
        </div>
      </div>
    );
  };
  
  


  const LoadingModal = () => {
    if (!isLoading) return null;

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
    );
  };


  const [isPageLoading, setIsPageLoading] = useState(false);
  useEffect(() => {
    setTimeout(() => {
      setIsPageLoading(false);
    }, 2000);
  }, []);


  return (
    <>
     {isPageLoading ? (
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white font-medium animate-pulse">Loading...</p>
          </div>
        </div>
      ) : (
      <div className="container text-xs">
        <div className="bridge-card">
          <div className=" flex justify-between items-center">
            <div className="bg-blue-500/40 p-2 text-white font-semibold rounded-[10px]">Winks Points: {winkpoints}</div>
            <div className="connect-button">
              <ConnectButton />
            </div>
          </div>
          {/* From section */}
          <div className="transfer-section">
            <div className="section-header">
              <div>From</div>

              <div className="balance">
                Balance: {Number(balance).toFixed(2)} ASTR
              </div>
            </div>
            <div className="network-row">
              <div className="network-info">
                <img
                  src="https://portal.astar.network/img/astar.4c1375f6.png"
                  className="network-logo"
                  alt="Astar EVM"
                />
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
              <div className="balance">
                Balance: {Number(soneumBalance).toFixed(4)} ASTR
              </div>
            </div>
            <div className="network-row">
              <div className="network-info">
                <img
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8xNzEzXzE5NTYpIj4KPGNpcmNsZSBjeD0iMTI4IiBjeT0iMTI4IiByPSIxMjgiIGZpbGw9IndoaXRlIi8+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMV8xNzEzXzE5NTYpIj4KPHBhdGggZD0iTTE0MS41ODUgMTg0LjY3NkMxMzEuODE3IDE4Ny4wMTQgMTIxLjYxMSAxODYuODE4IDExMS45NDEgMTg0LjEwNkMxMDIuMjcgMTgxLjM5NCA5My40NTkxIDE3Ni4yNTcgODYuMzQ2MiAxNjkuMTg0Qzc2LjkyOTMgMTYwLjIxOSA3MC44NzYgMTQ4LjMwOSA2OS4xOTM4IDEzNS40MzZDNjcuNTExNyAxMjIuNTYzIDcwLjMwMjIgMTA5LjUwNSA3Ny4xMDA5IDk4LjQzMzlDODEuNTY1OCA5MS4yMTY4IDg2Ljk0NDkgODQuNjAzOCA5My4xMDU0IDc4Ljc1ODFDMTEyLjY1OCA1OS4zNDA3IDE0OC41NTEgMjQuMDE3NSAxNDguNTUxIDI0LjAxNzVDMTIxLjg2OCAxOC43NDIzIDk0LjE3MTYgMjMuOTAyOSA3MS4yMDAxIDM4LjQzMDFDNDguMjI4MiA1Mi45NTc0IDMxLjc0MTEgNzUuNzM4MiAyNS4xNTM2IDEwMi4wNTRDMTguNTY2MSAxMjguMzY5IDIyLjM4MzIgMTU2LjIwMyAzNS44MTQyIDE3OS43ODlDNDkuMjQ1MiAyMDMuMzc1IDcxLjI2MDggMjIwLjkwNyA5Ny4zMDEgMjI4Ljc1MkwxNDEuNTg1IDE4NC42NzZaIiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNMTE0LjMxNiA3MC41MjE1QzEyNC4wODMgNjguMTgwNSAxMzQuMjkgNjguMzc1NSAxNDMuOTYgNzEuMDg3OEMxNTMuNjMxIDczLjggMTYyLjQ0MyA3OC45MzkxIDE2OS41NTQgODYuMDE0MkMxODguOTI1IDEwNS4zMjggMTkyLjcwNiAxMzMuOTkgMTc4LjcyMSAxNTYuNjYxQzE3NC4yNDkgMTYzLjg3OSAxNjguODcxIDE3MC41MDEgMTYyLjcxNyAxNzYuMzYyQzE0My4xNjUgMTk1Ljc1MyAxMDcuMjcxIDIzMS4xMDIgMTA3LjI3MSAyMzEuMTAyQzEzMy45NzkgMjM2LjQyOSAxNjEuNzE5IDIzMS4yOTcgMTg0LjczIDIxNi43N0MyMDcuNzQyIDIwMi4yNDEgMjI0LjI1OSAxNzkuNDM2IDIzMC44NSAxNTMuMDg3QzIzNy40NDMgMTI2LjczNyAyMzMuNjAzIDk4Ljg2ODMgMjIwLjEzIDc1LjI2NzJDMjA2LjY1NyA1MS42NjU4IDE4NC41ODQgMzQuMTQ0OCAxNTguNDk2IDI2LjM0MThMMTE0LjMxNiA3MC41MjE1WiIgZmlsbD0iYmxhY2siLz4KPC9nPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzE3MTNfMTk1NiI+CjxyZWN0IHdpZHRoPSIyNTYiIGhlaWdodD0iMjU2IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8Y2xpcFBhdGggaWQ9ImNsaXAxXzE3MTNfMTk1NiI+CjxyZWN0IHdpZHRoPSIyMTIiIGhlaWdodD0iMjEyIiBmaWxsPSJ3aGl0ZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjIgMjIpIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg=="
                  className="network-logo"
                  alt="Soneium"
                />
                <span className="network-name">Soneium</span>
              </div>
            </div>
          </div>

          {/* Amount section */}
          <div className="transfer-section">
            <div className="section-header1">
              {/* <div>To</div> */}
              <div className="balance">
                Balance: {Number(balance).toFixed(2)} ASTR
              </div>
            </div>
            <div className="network-row">
              <div className="network-info">
                <img
                  src="https://portal.astar.network/img/astar.4c1375f6.png"
                  className="network-logo"
                  alt="ASTR"
                />
                <span className="network-name">ASTR</span>
              </div>

              {/* <div className="balance">Balance: 15.016 ASTR</div> */}

              <div className="amount-input">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="token-amount"
                  placeholder="00"
                />
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="info-box">
            <ul>
              <li>Bridge fee: 7.68 ASTR</li>
              <li>You will receive 0.00008 ETH for gas on Soneium</li>
              <li>
                It could take approximately 3 mins to finalize the bridge
                transaction
              </li>
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
              className={`action-button approve ${
                parseFloat(amount) > 0 ? "active" : ""
              }`}
              onClick={BridgeHandler}
            >
              Bridge
            </button>
          </div>
          <p>Powered by winks.fun</p>
        </div>
      </div>
      )}
      <ErrorModal />
      <LoadingModal />
      <SuccessModal />
    </>
  );
}

export default App;
