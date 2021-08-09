pragma solidity ^0.5.16;

interface YVaultV1Interface {
    function token() external view returns (address);
    function getPricePerFullShare() external view returns (uint);
}

interface YVaultV2Interface {
    function token() external view returns (address);
    function pricePerShare() external view returns (uint);
}
