param([Parameter(Mandatory = $true)][string]$InstallerPath)

$signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Vizrt AG') {
    Write-Error "NDI SDK installer signature is not valid or is not from Vizrt AG. Status: $($signature.Status)"
    exit 1
}

Write-Output 'NDI SDK installer signature: valid (Vizrt AG)'
