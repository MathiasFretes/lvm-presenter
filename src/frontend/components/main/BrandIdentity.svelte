<script lang="ts">
    import "../../../../docs/brand/identity.css"
</script>

<h1 class="lvm-brand-identity">
    <img src="./icon.png" alt="" draggable={false} />
    <div>
        <strong>La Voz Misionera</strong>
        <small>Presenter</small>
    </div>
</h1>

<style>
    .lvm-brand-identity {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: var(--lvm-brand-lockup-gap);
        text-align: left;
        color: var(--text);
    }
    img {
        width: var(--lvm-brand-emblem-size);
        height: var(--lvm-brand-emblem-size);
        flex: none;
    }
    strong {
        display: block;
        font-size: var(--lvm-brand-name-size);
        line-height: 1.3;
    }
    small {
        display: block;
        font-size: var(--lvm-brand-product-size);
        line-height: 1.3;
    }
</style>
