// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "./EIP20Interface.sol";
import "./Joetroller.sol";
import "./JToken.sol";

contract RewardDistributorStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Active brains of Unitroller
     */
    Joetroller public joetroller;

    struct RewardMarketState {
        /// @notice The market's last updated joeBorrowIndex or joeSupplyIndex
        uint224 index;
        /// @notice The timestamp number the index was last updated at
        uint32 timestamp;
    }

    /// @notice The portion of supply reward rate that each market currently receives
    mapping(uint8 => mapping(address => uint256)) public rewardSupplySpeeds;

    /// @notice The portion of borrow reward rate that each market currently receives
    mapping(uint8 => mapping(address => uint256)) public rewardBorrowSpeeds;

    /// @notice The JOE/AVAX market supply state for each market
    mapping(uint8 => mapping(address => RewardMarketState)) public rewardSupplyState;

    /// @notice The JOE/AVAX market borrow state for each market
    mapping(uint8 => mapping(address => RewardMarketState)) public rewardBorrowState;

    /// @notice The JOE/AVAX borrow index for each market for each supplier as of the last time they accrued reward
    mapping(uint8 => mapping(address => mapping(address => uint256))) public rewardSupplierIndex;

    /// @notice The JOE/AVAX borrow index for each market for each borrower as of the last time they accrued reward
    mapping(uint8 => mapping(address => mapping(address => uint256))) public rewardBorrowerIndex;

    /// @notice The JOE/AVAX accrued but not yet transferred to each user
    mapping(uint8 => mapping(address => uint256)) public rewardAccrued;

    /// @notice The initial reward index for a market
    uint224 public constant rewardInitialIndex = 1e36;

    /// @notice JOE token contract address
    address public joeAddress;
}

contract RewardDistributor is RewardDistributorStorage, Exponential {
    /// @notice Emitted when a new reward supply speed is calculated for a market
    event RewardSupplySpeedUpdated(uint8 rewardType, JToken indexed jToken, uint256 newSpeed);

    /// @notice Emitted when a new reward borrow speed is calculated for a market
    event RewardBorrowSpeedUpdated(uint8 rewardType, JToken indexed jToken, uint256 newSpeed);

    /// @notice Emitted when JOE/AVAX is distributed to a supplier
    event DistributedSupplierReward(
        uint8 rewardType,
        JToken indexed jToken,
        address indexed supplier,
        uint256 rewardDelta,
        uint256 rewardSupplyIndex
    );

    /// @notice Emitted when JOE/AVAX is distributed to a borrower
    event DistributedBorrowerReward(
        uint8 rewardType,
        JToken indexed jToken,
        address indexed borrower,
        uint256 rewardDelta,
        uint256 rewardBorrowIndex
    );

    /// @notice Emitted when JOE is granted by admin
    event RewardGranted(uint8 rewardType, address recipient, uint256 amount);

    bool private initialized;

    constructor() public {
        admin = msg.sender;
    }

    function initialize() public {
        require(!initialized, "RewardDistributor already initialized");
        joetroller = Joetroller(msg.sender);
        initialized = true;
    }

    /**
     * @notice Checks caller is admin, or this contract is becoming the new implementation
     */
    function adminOrInitializing() internal view returns (bool) {
        return msg.sender == admin || msg.sender == address(joetroller);
    }

    /**
     * @notice Set JOE/AVAX speed for a single market
     * @param rewardType 0 = QI, 1 = AVAX
     * @param jToken The market whose reward speed to update
     * @param rewardSupplySpeed New reward supply speed for market
     * @param rewardBorrowSpeed New reward borrow speed for market
     */
    function _setRewardSpeed(
        uint8 rewardType,
        JToken jToken,
        uint256 rewardSupplySpeed,
        uint256 rewardBorrowSpeed
    ) public {
        require(rewardType <= 1, "rewardType is invalid");
        require(adminOrInitializing(), "only admin can set reward speed");
        setRewardSpeedInternal(rewardType, jToken, rewardSupplySpeed, rewardBorrowSpeed);
    }

    /**
     * @notice Set JOE/AVAX speed for a single market
     * @param rewardType  0: JOE, 1: AVAX
     * @param jToken The market whose speed to update
     * @param newSupplySpeed New JOE or AVAX supply speed for market
     * @param newBorrowSpeed New JOE or AVAX borrow speed for market
     */
    function setRewardSpeedInternal(
        uint8 rewardType,
        JToken jToken,
        uint256 newSupplySpeed,
        uint256 newBorrowSpeed
    ) internal {
        // Handle new supply speeed
        uint256 currentRewardSupplySpeed = rewardSupplySpeeds[rewardType][address(jToken)];
        if (currentRewardSupplySpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            updateRewardSupplyIndex(rewardType, address(jToken));
        } else if (newSupplySpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(address(jToken)), "reward market is not listed");

            if (
                rewardSupplyState[rewardType][address(jToken)].index == 0 &&
                rewardSupplyState[rewardType][address(jToken)].timestamp == 0
            ) {
                rewardSupplyState[rewardType][address(jToken)] = RewardMarketState({
                    index: rewardInitialIndex,
                    timestamp: safe32(getBlockTimestamp(), "block timestamp exceeds 32 bits")
                });
            }
        }

        if (currentRewardSupplySpeed != newSupplySpeed) {
            rewardSupplySpeeds[rewardType][address(jToken)] = newSupplySpeed;
            emit RewardSupplySpeedUpdated(rewardType, jToken, newSupplySpeed);
        }

        // Handle new borrow speed
        uint256 currentRewardBorrowSpeed = rewardBorrowSpeeds[rewardType][address(jToken)];
        if (currentRewardBorrowSpeed != 0) {
            // note that JOE speed could be set to 0 to halt liquidity rewards for a market
            Exp memory borrowIndex = Exp({mantissa: jToken.borrowIndex()});
            updateRewardBorrowIndex(rewardType, address(jToken), borrowIndex);
        } else if (newBorrowSpeed != 0) {
            // Add the JOE market
            require(joetroller.isMarketListed(address(jToken)), "reward market is not listed");

            if (
                rewardBorrowState[rewardType][address(jToken)].index == 0 &&
                rewardBorrowState[rewardType][address(jToken)].timestamp == 0
            ) {
                rewardBorrowState[rewardType][address(jToken)] = RewardMarketState({
                    index: rewardInitialIndex,
                    timestamp: safe32(getBlockTimestamp(), "block timestamp exceeds 32 bits")
                });
            }
        }

        if (currentRewardBorrowSpeed != newBorrowSpeed) {
            rewardBorrowSpeeds[rewardType][address(jToken)] = newBorrowSpeed;
            emit RewardBorrowSpeedUpdated(rewardType, jToken, newBorrowSpeed);
        }
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the supply index
     * @param rewardType  0: JOE, 1: AVAX
     * @param jToken The market whose supply index to update
     */
    function updateRewardSupplyIndex(uint8 rewardType, address jToken) public {
        require(rewardType <= 1, "rewardType is invalid");
        RewardMarketState storage supplyState = rewardSupplyState[rewardType][jToken];
        uint256 supplySpeed = rewardSupplySpeeds[rewardType][jToken];
        uint256 blockTimestamp = getBlockTimestamp();
        uint256 deltaTimestamps = sub_(blockTimestamp, uint256(supplyState.timestamp));
        if (deltaTimestamps > 0 && supplySpeed > 0) {
            uint256 supplyTokens = JToken(jToken).totalSupply();
            uint256 rewardAccrued = mul_(deltaTimestamps, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(rewardAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
            rewardSupplyState[rewardType][jToken] = RewardMarketState({
                index: safe224(index.mantissa, "new index exceeds 224 bits"),
                timestamp: safe32(blockTimestamp, "block timestamp exceeds 32 bits")
            });
        } else if (deltaTimestamps > 0) {
            supplyState.timestamp = safe32(blockTimestamp, "block timestamp exceeds 32 bits");
        }
    }

    /**
     * @notice Accrue JOE/AVAX to the market by updating the borrow index
     * @param rewardType  0: JOE, 1: AVAX
     * @param jToken The market whose borrow index to update
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateRewardBorrowIndex(
        uint8 rewardType,
        address jToken,
        Exp memory marketBorrowIndex
    ) internal {
        require(rewardType <= 1, "rewardType is invalid");
        RewardMarketState storage borrowState = rewardBorrowState[rewardType][jToken];
        uint256 borrowSpeed = rewardBorrowSpeeds[rewardType][jToken];
        uint256 blockTimestamp = getBlockTimestamp();
        uint256 deltaTimestamps = sub_(blockTimestamp, uint256(borrowState.timestamp));
        if (deltaTimestamps > 0 && borrowSpeed > 0) {
            uint256 borrowAmount = div_(JToken(jToken).totalBorrows(), marketBorrowIndex);
            uint256 rewardAccrued = mul_(deltaTimestamps, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(rewardAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
            rewardBorrowState[rewardType][jToken] = RewardMarketState({
                index: safe224(index.mantissa, "new index exceeds 224 bits"),
                timestamp: safe32(blockTimestamp, "block timestamp exceeds 32 bits")
            });
        } else if (deltaTimestamps > 0) {
            borrowState.timestamp = safe32(blockTimestamp, "block timestamp exceeds 32 bits");
        }
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a supplier and possibly transfer it to them
     * @param rewardType  0: JOE, 1: AVAX
     * @param jToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute JOE/AVAX to
     */
    function distributeSupplierReward(
        uint8 rewardType,
        address jToken,
        address supplier
    ) public {
        require(rewardType <= 1, "rewardType is invalid");
        RewardMarketState storage supplyState = rewardSupplyState[rewardType][jToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: rewardSupplierIndex[rewardType][jToken][supplier]});
        rewardSupplierIndex[rewardType][jToken][supplier] = supplyIndex.mantissa;

        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = rewardInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint256 supplierTokens = JToken(jToken).balanceOf(supplier);
        uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
        uint256 supplierAccrued = add_(rewardAccrued[rewardType][supplier], supplierDelta);
        rewardAccrued[rewardType][supplier] = supplierAccrued;
        emit DistributedSupplierReward(rewardType, JToken(jToken), supplier, supplierDelta, supplyIndex.mantissa);
    }

    /**
     * @notice Calculate JOE/AVAX accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param rewardType  0: JOE, 1: AVAX
     * @param jToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute JOE/AVAX to
     * @param marketBorrowIndex Current index of the borrow market
     */
    function distributeBorrowerReward(
        uint8 rewardType,
        address jToken,
        address borrower,
        Exp memory marketBorrowIndex
    ) public {
        require(rewardType <= 1, "rewardType is invalid");
        RewardMarketState storage borrowState = rewardBorrowState[rewardType][jToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: rewardBorrowerIndex[rewardType][jToken][borrower]});
        rewardBorrowerIndex[rewardType][jToken][borrower] = borrowIndex.mantissa;

        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint256 borrowerAmount = div_(JToken(jToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint256 borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint256 borrowerAccrued = add_(rewardAccrued[rewardType][borrower], borrowerDelta);
            rewardAccrued[rewardType][borrower] = borrowerAccrued;
            emit DistributedBorrowerReward(rewardType, JToken(jToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param jToken The market to verify the mint against
     * @param supplier The supplier to be rewarded
     */
    function updateAndDistributeSupplierRewardsForToken(address jToken, address supplier) external {
        require(adminOrInitializing(), "only admin can update and distribute supplier rewards");
        for (uint8 rewardType = 0; rewardType <= 1; rewardType++) {
            updateRewardSupplyIndex(rewardType, jToken);
            distributeSupplierReward(rewardType, jToken, supplier);
        }
    }

    /**
     * @notice Refactored function to calc and rewards accounts supplier rewards
     * @param jToken The market to verify the mint against
     * @param borrower Borrower to be rewarded
     * @param marketBorrowIndex Current index of the borrow market
     */
    function updateAndDistributeBorrowerRewardsForToken(
        address jToken,
        address borrower,
        Exp calldata marketBorrowIndex
    ) external {
        require(adminOrInitializing(), "only admin can update and distribute borrower rewards");
        for (uint8 rewardType = 0; rewardType <= 1; rewardType++) {
            updateRewardBorrowIndex(rewardType, jToken, marketBorrowIndex);
            distributeBorrowerReward(rewardType, jToken, borrower, marketBorrowIndex);
        }
    }

    /*** User functions ***/

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in all markets
     * @param holder The address to claim JOE/AVAX for
     */
    function claimReward(uint8 rewardType, address payable holder) public {
        return claimReward(rewardType, holder, joetroller.getAllMarkets());
    }

    /**
     * @notice Claim all the JOE/AVAX accrued by holder in the specified markets
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param holder The address to claim JOE/AVAX for
     * @param jTokens The list of markets to claim JOE/AVAX in
     */
    function claimReward(
        uint8 rewardType,
        address payable holder,
        JToken[] memory jTokens
    ) public {
        address payable[] memory holders = new address payable[](1);
        holders[0] = holder;
        claimReward(rewardType, holders, jTokens, true, true);
    }

    /**
     * @notice Claim all JOE/AVAX  accrued by the holders
     * @param rewardType  0 = JOE, 1 = AVAX
     * @param holders The addresses to claim JOE/AVAX for
     * @param jTokens The list of markets to claim JOE/AVAX in
     * @param borrowers Whether or not to claim JOE/AVAX earned by borrowing
     * @param suppliers Whether or not to claim JOE/AVAX earned by supplying
     */
    function claimReward(
        uint8 rewardType,
        address payable[] memory holders,
        JToken[] memory jTokens,
        bool borrowers,
        bool suppliers
    ) public payable {
        require(rewardType <= 1, "rewardType is invalid");
        for (uint256 i = 0; i < jTokens.length; i++) {
            JToken jToken = jTokens[i];
            require(joetroller.isMarketListed(address(jToken)), "market must be listed");
            if (borrowers == true) {
                Exp memory borrowIndex = Exp({mantissa: jToken.borrowIndex()});
                updateRewardBorrowIndex(rewardType, address(jToken), borrowIndex);
                for (uint256 j = 0; j < holders.length; j++) {
                    distributeBorrowerReward(rewardType, address(jToken), holders[j], borrowIndex);
                    rewardAccrued[rewardType][holders[j]] = grantRewardInternal(
                        rewardType,
                        holders[j],
                        rewardAccrued[rewardType][holders[j]]
                    );
                }
            }
            if (suppliers == true) {
                updateRewardSupplyIndex(rewardType, address(jToken));
                for (uint256 j = 0; j < holders.length; j++) {
                    distributeSupplierReward(rewardType, address(jToken), holders[j]);
                    rewardAccrued[rewardType][holders[j]] = grantRewardInternal(
                        rewardType,
                        holders[j],
                        rewardAccrued[rewardType][holders[j]]
                    );
                }
            }
        }
    }

    /**
     * @notice Transfer JOE/AVAX to the user
     * @dev Note: If there is not enough JOE/AVAX, we do not perform the transfer all.
     * @param rewardType 0 = JOE, 1 = AVAX.
     * @param user The address of the user to transfer JOE/AVAX to
     * @param amount The amount of JOE/AVAX to (possibly) transfer
     * @return The amount of JOE/AVAX which was NOT transferred to the user
     */
    function grantRewardInternal(
        uint8 rewardType,
        address payable user,
        uint256 amount
    ) public returns (uint256) {
        if (rewardType == 0) {
            EIP20Interface joe = EIP20Interface(joeAddress);
            uint256 joeRemaining = joe.balanceOf(address(this));
            if (amount > 0 && amount <= joeRemaining) {
                joe.transfer(user, amount);
                return 0;
            }
        } else if (rewardType == 1) {
            uint256 avaxRemaining = address(this).balance;
            if (amount > 0 && amount <= avaxRemaining) {
                user.transfer(amount);
                return 0;
            }
        }
        return amount;
    }

    /*** Joe Distribution Admin ***/

    /**
     * @notice Transfer JOE to the recipient
     * @dev Note: If there is not enough JOE, we do not perform the transfer all.
     * @param rewardType 0 = JOE, 1 = AVAX
     * @param recipient The address of the recipient to transfer JOE to
     * @param amount The amount of JOE to (possibly) transfer
     */
    function _grantReward(
        uint8 rewardType,
        address payable recipient,
        uint256 amount
    ) public {
        require(adminOrInitializing(), "only admin can grant joe");
        uint256 amountLeft = grantRewardInternal(rewardType, recipient, amount);
        require(amountLeft == 0, "insufficient joe for grant");
        emit RewardGranted(rewardType, recipient, amount);
    }

    /**
     * @notice Set the JOE token address
     */
    function setJoeAddress(address newJoeAddress) public {
        require(msg.sender == admin, "only admin can set JOE");
        joeAddress = newJoeAddress;
    }

    /**
     * @notice Set the Joetroller address
     */
    function setJoetroller(address _joetroller) public {
        require(msg.sender == admin, "only admin can set Joetroller");
        joetroller = Joetroller(_joetroller);
    }

    /**
     * @notice Set the admin
     */
    function setAdmin(address _newAdmin) public {
        require(msg.sender == admin, "only admin can set admin");
        admin = _newAdmin;
    }

    /**
     * @notice payable function needed to receive AVAX
     */
    function() external payable {}

    function getBlockTimestamp() public view returns (uint256) {
        return block.timestamp;
    }
}
